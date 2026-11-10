# Greuro MCP: financial information and management

The MCP server uses the signed-in user's existing snapshot and RLS. Browser and MCP funding operations share `src/lib/budgetDomain.js`; calculations use `src/lib/budgetAnalytics.js`. No service-role credential is used.

## Revisions and explicit actions

Read `get_budget_data` or `get_financial_data`, then use its `updated_at`/`updatedAt` as `expectedUpdatedAt` in management calls. Optionally call `preview_budget_action({ action, input })` first: it returns exact effects, changed tables, pooled totals and the revision without saving. Stale confirmations fail; Supabase also checks the revision atomically.

Management results contain `{ result, pool, updatedAt }`. Errors contain `{ error, code, details }` with `isError: true`. `RELEASE_REQUIRED` includes shortfall and goals; retry with explicit `releases: [{ goalId, amount }]`. No tool chooses releases or silently reassigns purchases.

IDs are positive integers; amounts are EUR; dates are Unix milliseconds. `get_financial_data` accepts `asOf`, `timeZone` (default Europe/Brussels), inclusive `from`/`to`, an optional custom savings `target`, and `averageMonths` (1–12). The default is the saved `savingsAverageMonths` preference, or three completed months. Reads include archived records and all stored metadata. Settings include effective defaults and raw records.

## Coverage matrix

| App information/action | Read interface | Management interface |
| --- | --- | --- |
| Every stored financial field and link | `get_budget_data`, `get_financial_data.records` | `update_budget_data` for explicit full restore |
| Accounts, usage, return assumptions, starting/current balances | `list_accounts`, `get_financial_data.accounts` | `add_account`, `update_account`, `delete_account`, `set_account_balance` |
| Categories, icons, colours, kinds, exclusions, totals | `list_categories`, `.categories`, `.spending` | `add_category`, `update_category`, `delete_category` |
| Transactions, trip/goal links, funded amounts, historical flags, reimbursement/refund metadata | `get_transactions`, `.records.transactions` | `add_transactions`, `update_transaction`, `delete_transaction` |
| Pooled, reserved, available money and shortfalls | `.pool` | `reserve_goal`, `release_goal`, `resolve_savings_shortfall`, explicit transaction releases |
| Goal targets, spent/reserved/to-fund, overruns, progress segments, review status | `list_goals`, `.goals` | `add_goal`, `update_goal`, `delete_goal`, `review_legacy_goal`, `reserve_goal`, `release_goal`, `finish_goal`, `reopen_goal` |
| Trips, goal defaults, purchases, totals/per-day, archive state | `list_trips`, `.trips`, `preview_trip_goal` | `add_trip`, `update_trip`, `delete_trip`, `assign_trip_goal`, confirmed finish/reopen |
| Three recent months and Average, amounts and reconciled percentages | `.allocation`, `.average` | Derived from transactions |
| Goal/custom time-to-save results | `.goals[].calculator`, `.calculator` | Calculation only |
| Net worth, cash flow, income/expenses, category spending, report comparisons | `.netWorth`, `.accounts[].cashFlow`, `.totals`, `.spending`, `.report` | Derived from financial records |
| Owed people, purchases, outstanding/resolved totals | `.owed`, `.owedTotal`, `get_transactions` | `update_transaction` with `resolved: 1` or `0` |
| Scheduled templates, recurrence, dates and due status | `list_scheduled`, `.scheduled` | `add_scheduled`, `update_scheduled`, `delete_scheduled`, `post_scheduled` |
| All persisted preferences, defaults and forecast assumptions | `get_settings`, `.settings` | `set_settings` |
| Investment accounts, monthly forecast bands and reference values | `.forecast` | Account returns and forecast settings |
| Finish/reopen group and money released | `preview_budget_action` | `finish_goal`, `reopen_goal`, confirmed `update_trip` |
| Complete backup/restore | `get_budget_data` | `update_budget_data` |

Dotted read paths above refer to `get_financial_data`. Credentials and transient UI state are outside financial-data exposure. Exported file contents are represented by the complete records, reports, goal summaries and pooled values.

## Inputs

- `get_transactions`: optional `dateFrom`, `dateTo`, `accountId`, `categoryId`, `tripId`, `goalId`, `type`, `limit`; newest first. Account matches either transfer endpoint; omit limit for all.
- `add_transactions`: `{ transactions: [...], releases?, expectedUpdatedAt }`. Ordinary transaction fields. Omitted expense `goalId` inherits the trip default; explicit null means None. All-or-nothing batch.
- `update_transaction`: `{ id, fields, releases?, expectedUpdatedAt }`; delete takes `{ id, releases?, expectedUpdatedAt }`. Funding counters are service-managed.
- `add_account/category/goal/trip/scheduled`: `{ fields, expectedUpdatedAt }`; update adds `id`, optional `confirm` and `releases`; delete uses `{ id, confirm?, releases?, expectedUpdatedAt }`.
- `reserve_goal`, `release_goal`, `review_legacy_goal`: `{ id, amount, expectedUpdatedAt }`. Zero is allowed for one-time legacy review.
- `finish_goal`, `reopen_goal`: `{ id, confirm: true, expectedUpdatedAt }`. Finishing releases money and archives linked trips; reopening reservations nothing.
- `preview_trip_goal`: `{ id, goalId }`; returns purchases with existing funding assignments.
- `assign_trip_goal`: `{ id, goalId, transactionIds, confirm: true, confirmReassign?, releases?, expectedUpdatedAt }`. Historical imports consume no current reserve. Existing links need explicit reassignment confirmation.
- `set_account_balance`: `{ id, balance, releases?, expectedUpdatedAt }`; creates a statistics-excluded balance correction.
- `set_settings`: `{ values: { key: value, ... }, expectedUpdatedAt }`.
- `post_scheduled`: `{ asOf?, expectedUpdatedAt }`; posts occurrences once, advances schedules, and flags uncovered reservations for release resolution.
- `resolve_savings_shortfall`: `{ releases: [{ goalId, amount }], expectedUpdatedAt }`.
- `update_budget_data`: `{ budget, expectedUpdatedAt }`; explicit full version-1 restore. Entire-budget clearing remains prohibited. Restored shortfalls are marked for resolution.

Examples: reserve with `reserve_goal({ id: 1, amount: 100, expectedUpdatedAt: revision })`. Pay cash using an expense with the cash `accountId` and linked `tripId`; no transfer is created. Refund using income with `refundOfTransactionId: purchaseId`; only actual consumed funding can be restored, with caps against double refunds.

## Validation and rollout

```sh
npm test
npm run build
node scripts/verify-savings.mjs
deno check --node-modules-dir=none supabase/functions/mcp/index.ts
deno test --node-modules-dir=none supabase/functions/mcp/transactionTools_test.ts supabase/functions/mcp/budgetTools_test.ts
supabase start
supabase db reset
supabase test db
```

The npm suite includes real-schema MCP contracts, parity fixtures and actual migrations in embedded PostgreSQL with RLS and revision tests. Native Supabase checks still cover the complete deployment environment.

Deploy the savings-integrity migration before the updated client/function. All snapshot and legacy transaction writes pass through its validation trigger. Deployment is separate from implementation.
