# Savings behaviour and delivery record

## Stages

1. Settings and Optional cleanup: existing 163 tests and build passed.
2. Savings navigation, allocation and calculator: 168 tests and build passed.
3. Pooled reservations, purchases, trips, finishing and correction operations: domain tests and isolated mobile browser verification passed.
4. MCP management, derived information, revision-aware previews and PostgreSQL validation: contract, parity and database tests added. See the MCP coverage matrix in `supabase/functions/mcp/README.md`.

Nothing in this change deploys the site, database or edge function. CashFlowCard is unchanged. No debt or live investment features were added.

## Money rules

The pool is the sum of all non-investment asset balances, including cash. Available money is the pool minus active reservations. Goals have no backing account. Funding operations use integer cents internally.

Goal progress consists of net linked spending plus remaining reservations. The target defines 100%; excess spending is an overrun. Historical imports count spending without consuming today's reservations. New purchases consume the goal's reserve first, then available money, regardless of payment account. Tagging a goal never creates a transfer.

Manual changes that uncover reservations require explicit releases in the same atomic operation. Suggestions round the shortfall up by €25, with two larger choices and Custom. Scheduled posting and explicit restores preserve financial records even when underfunded, set `savingsResolutionRequired`, and present release resolution.

Purchases persist `goalId`, `fundedAmount` and `historicalFunding`. Refund income persists `refundOfTransactionId`, `goalId` and `fundingRestored`. Editing/deleting reconciles the prior effect; only consumed funding can be restored. Linked refunds must be removed before deleting or reassigning their purchase.

Finishing releases unused reservations and archives the goal and every connected trip. Reopening never recreates released money. Finished purchases retain their original funding metadata with `fundingClosed`; later corrections or refunds to that closed funding remain available rather than silently re-reserving it. Archive preserves history; goals with purchases cannot be deleted.

## Compatibility

Goals without `modelVersion: 2` remain legacy records until their old calculated progress is reviewed and an reserve confirmed. New goals start at zero. Legacy fields are retained on conversion.

The version-1 envelope is unchanged. New fields are additive. Merge remaps goal, trip, account, category and refund references. Restored shortfalls require release resolution. Excel includes goal summaries, pooled totals and transaction links.

## Verification

`npm test` includes funding scenarios, existing app regressions, backup compatibility, MCP schemas/contracts and app/MCP parity. PostgreSQL tests execute actual migrations in isolated PGlite, including RLS and optimistic concurrency.

`node scripts/verify-savings.mjs` launches an isolated localhost server and headless Chrome at mobile width. It mocks all Supabase requests: no real budget is accessed or changed. Screenshots are saved under ignored `.test-tmp/screenshots`.

Also run Deno and native Supabase checks in a supported environment. Deploy migrations before dependent clients/functions. Unrun checks must not be reported as passing.

## Allocation chart and averaging

The chart shows the current month and the two preceding calendar months, plus Average. Columns use percentages of income, with a 100% guide and a zero baseline. Negative allocations extend below zero with a hatched fill. Amounts and percentages remain visible below every column; zero-income months show amounts with undefined percentages rather than inventing income.

Average and Time to save share the persisted `savingsAverageMonths` preference: 1–12 completed calendar months, default three. The partial current month is never included. Empty calendar months retain the previous zero-month treatment. The window does not change the displayed month columns or transaction records. MCP accepts the same preference and an optional read-only `averageMonths` override. Excel uses the saved preference.

Positive and negative adjustments, and both kinds of excluded categories, continue to affect account balances while being excluded from income, expenses, cash flow and allocation. No corrections are redistributed across periods.
