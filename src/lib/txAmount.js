/**
 * Effective transaction amounts.
 *
 * PAID-BACK CONVENTION
 * --------------------
 * When you front money for someone (group dinner, work expense) you log the
 * FULL amount you paid and tick "needs to be paid back". `owedAmount` is the
 * total you expect back — a fixed figure you set once (and can correct), NOT
 * a running tally of partial payments received. The transaction counts as
 * the FULL amount for as long as it's pending: nothing is netted just
 * because an owed figure is sitting there. Only the explicit `resolved` flag
 * (one tap once the money has actually come back) nets it — the reimbursement
 * is deliberately NOT a separate income row, that would inflate income.
 *
 * Pay 100 €, 60 € of it is someone else's share: it counts as 100 € the
 * whole time you're waiting, and drops to 40 € the moment you mark it
 * Resolved.
 *
 * Pure module (no db import) so the derivation layer and the UI share one
 * definition.
 */

/** Paid-back only applies to reimbursable expenses. */
function isReimbursableExpense(tx) {
  return tx?.type === 'expense' && Boolean(tx?.reimbursable)
}

/** What the transaction is actually worth: full amount while pending, net of
 *  the owed amount once marked Resolved. */
export function effectiveAmount(tx) {
  const amount = Number(tx?.amount) || 0
  if (!isReimbursableExpense(tx) || !tx.resolved) return amount
  const owed = Math.max(0, Number(tx.owedAmount) || 0)
  return Math.max(0, amount - owed)
}

/** How much is still owed to you on this transaction (0 once resolved or
 *  when not tagged). */
export function outstandingAmount(tx) {
  if (!isReimbursableExpense(tx) || tx.resolved) return 0
  return Math.max(0, Number(tx.owedAmount) || 0)
}

/** True once a reimbursable expense has been explicitly marked as fully
 *  paid back ("Resolved") — a one-way flag you set, not derived from the
 *  owed amount reaching zero. */
export function isResolved(tx) {
  return isReimbursableExpense(tx) && Boolean(tx.resolved)
}
