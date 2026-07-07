import { addMonthsClamped, todayNoon } from './dates'

/**
 * Forward net-worth projection — ASSUMPTIONS, NOT PREDICTIONS.
 *
 * Model (monthly steps from today):
 *   - Every account compounds at a monthly rate derived from its own
 *     expectedAnnualReturn. Cash (0 %) stays flat.
 *   - Every ACTIVE scheduled item is applied at its monthly-equivalent
 *     amount: income adds to its account, expense subtracts, transfers move
 *     money between accounts — so recurring contributions into
 *     return-bearing accounts compound, per the product spec.
 *   - The "standard investment" (settings.monthlyInvestment, €/month) is a
 *     fresh contribution each month INTO the highest-return account —
 *     assumed to come from income, so it raises net worth and compounds.
 *     It is the simple "what if I keep investing X" lever.
 *   - Scenario bands scale each account's own rate by the ratio of the
 *     settings' pessimistic/optimistic assumption to the base assumption
 *     (defaults 5/7/9 % → an account at 7 % projects at 5/7/9 %; an account
 *     at 3 % projects at 2.1/3/3.9 %). This honours both the per-account
 *     rate and the global assumptions.
 *   - Inflation adjustment divides month m by (1+inflation)^(m/12) (real,
 *     today's euros).
 */

const MONTHS_PER_YEAR = 12
// Average occurrences per month for sub-monthly recurrences.
const DAYS_PER_MONTH = 365.25 / 12
const WEEKS_PER_MONTH = DAYS_PER_MONTH / 7

/** Monthly-equivalent amount of a scheduled item. */
export function monthlyEquivalent(item) {
  const { unit, interval } = item.recurrence
  const perMonth =
    unit === 'day'
      ? DAYS_PER_MONTH / interval
      : unit === 'week'
        ? WEEKS_PER_MONTH / interval
        : unit === 'month'
          ? 1 / interval
          : 1 / (MONTHS_PER_YEAR * interval)
  return (Number(item.amount) || 0) * perMonth
}

function monthlyRate(annualPercent) {
  return Math.pow(1 + annualPercent / 100, 1 / MONTHS_PER_YEAR) - 1
}

/** The account the standard monthly investment flows into. */
export function investmentTargetId(accounts) {
  if (accounts.length === 0) return null
  const best = [...accounts].sort(
    (a, b) => (Number(b.expectedAnnualReturn) || 0) - (Number(a.expectedAnnualReturn) || 0),
  )[0]
  return best.id
}

/** One scenario run; returns net-worth value per month 0..months. */
function project({ accounts, startBalances, scheduled, months, rateScale, monthlyInvestment = 0 }) {
  const balances = new Map()
  const rates = new Map()
  for (const a of accounts) {
    balances.set(a.id, startBalances.get(a.id) ?? 0)
    rates.set(a.id, monthlyRate((Number(a.expectedAnnualReturn) || 0) * rateScale))
  }
  const investTarget = monthlyInvestment > 0 ? investmentTargetId(accounts) : null
  const flows = scheduled
    .filter((s) => s.active !== 0)
    .map((s) => ({ ...s, monthly: monthlyEquivalent(s) }))

  const values = []
  const sum = () => [...balances.values()].reduce((acc, v) => acc + v, 0)
  values.push(sum())

  for (let m = 1; m <= months; m++) {
    // Growth first, then this month's flows.
    for (const [id, bal] of balances) balances.set(id, bal * (1 + rates.get(id)))
    if (investTarget != null) {
      balances.set(investTarget, balances.get(investTarget) + monthlyInvestment)
    }
    for (const f of flows) {
      if (f.type === 'income') {
        if (balances.has(f.accountId)) balances.set(f.accountId, balances.get(f.accountId) + f.monthly)
      } else if (f.type === 'expense') {
        if (balances.has(f.accountId)) balances.set(f.accountId, balances.get(f.accountId) - f.monthly)
      } else if (f.type === 'transfer') {
        if (balances.has(f.fromAccountId))
          balances.set(f.fromAccountId, balances.get(f.fromAccountId) - f.monthly)
        if (balances.has(f.toAccountId))
          balances.set(f.toAccountId, balances.get(f.toAccountId) + f.monthly)
      }
    }
    values.push(sum())
  }
  return values
}

/**
 * Pessimistic / base / optimistic projection bands.
 *
 * @param accounts       account rows (expectedAnnualReturn is used)
 * @param startBalances  Map<accountId, signed balance> — from accountBalances()
 * @param scheduled      scheduled rows (inactive ones are ignored)
 * @param horizonYears   1 | 5 | 10 | 20
 * @param settings       { returnPess, returnBase, returnOpt, inflationRate, inflationAdjust }
 * @returns Array<{ ts, base, pess, opt, range: [pess, opt] }> — monthly points,
 *          inflation-discounted when settings.inflationAdjust is on
 */
export function projectBands({ accounts, startBalances, scheduled, horizonYears, settings }) {
  const months = horizonYears * MONTHS_PER_YEAR
  const base = Number(settings.returnBase) || 0
  const scaleOf = (pct) => (base > 0 ? (Number(pct) || 0) / base : 1)

  const shared = {
    accounts,
    startBalances,
    scheduled,
    months,
    monthlyInvestment: Math.max(0, Number(settings.monthlyInvestment) || 0),
  }
  const baseRun = project({ ...shared, rateScale: 1 })
  const pessRun = project({ ...shared, rateScale: scaleOf(settings.returnPess) })
  const optRun = project({ ...shared, rateScale: scaleOf(settings.returnOpt) })

  const inflMonthly = settings.inflationAdjust
    ? Math.pow(1 + (Number(settings.inflationRate) || 0) / 100, 1 / MONTHS_PER_YEAR)
    : 1
  const start = todayNoon()

  const points = []
  let discount = 1
  for (let m = 0; m <= months; m++) {
    const p = pessRun[m] / discount
    const o = optRun[m] / discount
    points.push({
      ts: addMonthsClamped(start, m, new Date(start).getDate()),
      base: baseRun[m] / discount,
      pess: p,
      opt: o,
      range: [p, o],
    })
    discount *= inflMonthly
  }
  return points
}
