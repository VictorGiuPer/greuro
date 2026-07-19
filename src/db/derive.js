import { db } from './db'
import { monthRange } from '../lib/dates'

/**
 * Derivation layer — every dashboard/report number is computed from
 * transactions + startingBalance. Nothing here is ever stored.
 *
 * BALANCE MODEL
 * -------------
 * An account's "balance" is its SIGNED net-worth value:
 *   - asset:     starts at +startingBalance
 *   - liability: starts at −startingBalance (startingBalance is entered as a
 *                positive "amount owed")
 * Flows apply uniformly per the documented convention (expense −accountId,
 * income +accountId, transfer −from +to). This keeps transfers net-worth
 * neutral even across asset/liability boundaries: paying 500 € of debt moves
 * value −500 on the asset and +500 on the (negative) liability.
 *
 * Net worth = Σ balances (assets positive, liabilities already negative).
 * UIs that want "amount owed" for a liability display −balance.
 */

function startingValue(account) {
  const start = Number(account.startingBalance) || 0
  return account.type === 'liability' ? -start : start
}

function applyTx(balances, t) {
  const amt = Number(t.amount) || 0
  if (t.type === 'expense') {
    if (balances.has(t.accountId)) balances.set(t.accountId, balances.get(t.accountId) - amt)
  } else if (t.type === 'income') {
    if (balances.has(t.accountId)) balances.set(t.accountId, balances.get(t.accountId) + amt)
  } else if (t.type === 'transfer') {
    if (balances.has(t.fromAccountId))
      balances.set(t.fromAccountId, balances.get(t.fromAccountId) - amt)
    if (balances.has(t.toAccountId)) balances.set(t.toAccountId, balances.get(t.toAccountId) + amt)
  }
}

/**
 * Signed balance per account as of `atDateMs` (inclusive; default: all time).
 * @returns {Promise<Map<number, number>>} accountId -> signed balance
 */
export async function accountBalances(atDateMs = null) {
  const accounts = await db.accounts.toArray()
  const balances = new Map(accounts.map((a) => [a.id, startingValue(a)]))
  const txs =
    atDateMs == null
      ? await db.transactions.toArray()
      : await db.transactions.where('date').belowOrEqual(atDateMs).toArray()
  for (const t of txs) applyTx(balances, t)
  return balances
}

/** Net worth (Σ signed balances) as of `atDateMs` (default: now). */
export async function netWorthAt(atDateMs = null) {
  const balances = await accountBalances(atDateMs)
  let total = 0
  for (const v of balances.values()) total += v
  return total
}

/** Transactions within a { from, to } range (inclusive), unordered. */
function txInRange(from, to) {
  return db.transactions.where('date').between(from, to, true, true).toArray()
}

/**
 * Category ids flagged `excludeFromStats` ("balance only"). Their transactions
 * still move account balances / net worth, but are ignored by cash flow, net
 * earnings and spending — so quarterly balance corrections don't distort a
 * month's stats.
 */
async function excludedCategoryIds() {
  const cats = await db.categories.filter((c) => Boolean(c.excludeFromStats)).toArray()
  return new Set(cats.map((c) => c.id))
}

/**
 * Cash flow for ONE account over a period — transfers COUNT (this card shows
 * the account's health, so money moving in/out matters regardless of type).
 * @returns {{ inflow: number, outflow: number, net: number }}
 */
export async function cashFlow({ accountId, from, to }) {
  const [txs, excluded] = await Promise.all([txInRange(from, to), excludedCategoryIds()])
  let inflow = 0
  let outflow = 0
  for (const t of txs) {
    const amt = Number(t.amount) || 0
    // Balance-only categories (e.g. quarterly adjustments) don't count as flow.
    if ((t.type === 'income' || t.type === 'expense') && excluded.has(t.categoryId)) continue
    if (t.type === 'income' && t.accountId === accountId) inflow += amt
    else if (t.type === 'expense' && t.accountId === accountId) outflow += amt
    else if (t.type === 'transfer') {
      if (t.toAccountId === accountId) inflow += amt
      if (t.fromAccountId === accountId) outflow += amt
    }
  }
  return { inflow, outflow, net: inflow - outflow }
}

/**
 * Expenses grouped by category over a period — transfers EXCLUDED (they are
 * not spending). Sorted largest first.
 * @returns {Promise<Array<{ categoryId: number|null, total: number }>>}
 */
export async function spendingByCategory({ from, to }) {
  const [txs, excluded] = await Promise.all([txInRange(from, to), excludedCategoryIds()])
  const totals = new Map()
  for (const t of txs) {
    if (t.type !== 'expense') continue
    if (excluded.has(t.categoryId)) continue
    const key = t.categoryId ?? null
    totals.set(key, (totals.get(key) || 0) + (Number(t.amount) || 0))
  }
  return [...totals.entries()]
    .map(([categoryId, total]) => ({ categoryId, total }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Income / expense totals over a period — transfers EXCLUDED.
 * @returns {{ income: number, expense: number, net: number }}
 */
export async function incomeExpenseTotals({ from, to }) {
  const [txs, excluded] = await Promise.all([txInRange(from, to), excludedCategoryIds()])
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (excluded.has(t.categoryId)) continue
    const amt = Number(t.amount) || 0
    if (t.type === 'income') income += amt
    else if (t.type === 'expense') expense += amt
  }
  return { income, expense, net: income - expense }
}

/**
 * Everything the monthly report needs for calendar month `mIdx` of `year`,
 * including the delta vs the previous month and the net-worth change.
 * Category totals carry ids only — the UI resolves names/colors.
 */
export async function monthlyReport(year, mIdx) {
  const range = monthRange(year, mIdx)
  const prevRange = monthRange(mIdx === 0 ? year - 1 : year, (mIdx + 11) % 12)

  const [totals, prevTotals, categories, worthStart, worthEnd] = await Promise.all([
    incomeExpenseTotals(range),
    incomeExpenseTotals(prevRange),
    spendingByCategory(range),
    netWorthAt(range.from - 1),
    netWorthAt(range.to),
  ])

  return {
    range,
    totals,
    prevTotals,
    delta: {
      income: totals.income - prevTotals.income,
      expense: totals.expense - prevTotals.expense,
      net: totals.net - prevTotals.net,
    },
    topCategories: categories,
    netWorthStart: worthStart,
    netWorthEnd: worthEnd,
    netWorthChange: worthEnd - worthStart,
  }
}
