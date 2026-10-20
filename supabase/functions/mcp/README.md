# Greuro transaction tools

The MCP server retains `get_budget_data` and `update_budget_data` for backup/restore.
Every granular operation runs as the authenticated user under the existing RLS
policies. No service-role credentials or new storage format are used.

| Tool | Input | Result |
| --- | --- | --- |
| `add_transactions` | `{ transactions: [...] }` | Array of created records |
| `update_transaction` | `{ id, fields: { ... } }` | Updated record |
| `delete_transaction` | `{ id }` | `{ deleted: true, id }` |
| `get_transactions` | Optional `dateFrom`, `dateTo`, `accountId`, `categoryId`, `type`, `limit` | Array of matching records |
| `list_accounts` | `{}` | Account records |
| `list_categories` | `{}` | Category records |

Dates and record timestamps use Unix milliseconds. IDs are positive numeric
integers. Income and expense records require an existing account and a category
whose `kind` matches `type`. Transfers require distinct existing `fromAccountId`
and `toAccountId`; they do not require `accountId` or `categoryId`. An optional
`tripId` must identify an existing trip. Boolean flags accept booleans or 0/1 and
are stored as 0/1, matching the app. `description` is required on creation and may
be empty. Amounts must be positive. `owedAmount` must be nonnegative.

Creation assigns IDs starting at the current maximum + 1 and sets `createdAt`
and `updatedAt`. Updates merge only the supplied fields and set `updatedAt`,
preserving `createdAt` and any other existing fields. IDs and timestamps cannot
be supplied by callers. Missing update/delete targets are errors.

Queries combine filters with AND, include both date bounds, and return newest
date then highest ID first. An account matches either transfer endpoint. Omit
`limit` for all matching records. Reads return an error if no budget exists.

Granular writes lock the user's budget row. Validation of the entire batch
finishes before the single database write; errors roll back everything. Only
`data.transactions` and the row revision `updated_at` change. The revision keeps
the app's existing optimistic full-snapshot saves from overwriting granular edits
made since the app last loaded. A stale app must reload before saving.

## Validation and deployment

Run the database tests on local Supabase and the tool tests with Deno:

```sh
supabase start
supabase db reset
supabase test db
deno test supabase/functions/mcp/transactionTools_test.ts
npm test
```

Deploy the migration **before** the function:

```sh
supabase db push
supabase functions deploy mcp
```

The migration adds the `greuro_transactions` RPC and its validation helper. It
does not migrate or rewrite existing budget data.
