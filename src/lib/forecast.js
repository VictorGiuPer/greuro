import { addMonthsClamped, todayNoon } from './dates'

/**
 * Forward INVESTMENT projection — ASSUMPTIONS, NOT PREDICTIONS.
 *
 * Model (monthly steps from today; investment accounts only):
 *   - Every investment account compounds at ITS OWN expectedAnnualReturn.
 *   - The "keep investing" amount (settings.monthlyInvestment, €/month) is a
 *     fresh contribution each month into ONE chosen account
 *     (settings.investmentTargetAccountId, default = highest-return account).
 *   - Best / worst bands shift every account's rate by ±`forecastBandSpread`
 *     percentage points (worst floored at 0 — this simple model never assumes
 *     you lose money).
 *   - NOTHING else feeds it: no scheduled/recurring transfers, no active
 *     accounts. The single "keep investing" number is the only contribution,
 *     so it can't double-count with a recurring reminder.
 *   - Inflation adjustment divides month m by (1+inflation)^(m/12).
 */

const MONTHS_PER_YEAR = 12

function monthlyRate(annualPercent) {
  return Math.pow(1 + annualPercent / 100, 1 / MONTHS_PER_YEAR) - 1
}

/** Default target for the monthly contribution: the highest-return account. */
export function investmentTargetId(accounts) {
  if (accounts.length === 0) return null
  const best = [...accounts].sort(
    (a, b) => (Number(b.expectedAnnualReturn) || 0) - (Number(a.expectedAnnualReturn) || 0),
  )[0]
  return best.id
}

/**
 * One scenario run → net investment value per month 0..months.
 * @param spreadSign  -1 worst · 0 base · +1 best (shifts each rate by ±spread)
 */
function project({ accounts, startBalances, months, spreadSign, spread, monthlyInvestment, targetId }) {
  const balances = new Map()
  const rates = new Map()
  for (const a of accounts) {
    balances.set(a.id, startBalances.get(a.id) ?? 0)
    const annual = (Number(a.expectedAnnualReturn) || 0) + spreadSign * spread
    rates.set(a.id, monthlyRate(Math.max(0, annual))) // worst never below 0%
  }
  const invest = monthlyInvestment > 0 && balances.has(targetId) ? monthlyInvestment : 0

  const values = []
  const sum = () => [...balances.values()].reduce((acc, v) => acc + v, 0)
  values.push(sum())

  for (let m = 1; m <= months; m++) {
    for (const [id, bal] of balances) balances.set(id, bal * (1 + rates.get(id)))
    if (invest) balances.set(targetId, balances.get(targetId) + invest)
    values.push(sum())
  }
  return values
}

/**
 * Best / base / worst projection bands for the investment accounts.
 *
 * @param accounts       investment account rows (expectedAnnualReturn used)
 * @param startBalances  Map<accountId, balance> — from accountBalances()
 * @param horizonYears   5 | 10 | 20
 * @param settings       { monthlyInvestment, investmentTargetAccountId,
 *                         forecastBandSpread, inflationRate, inflationAdjust }
 * @returns Array<{ ts, base, pess, opt, range:[pess,opt] }> — monthly points
 *          (pess = worst, opt = best; inflation-discounted when enabled)
 */
export function projectBands({ accounts, startBalances, horizonYears, settings }) {
  const months = horizonYears * MONTHS_PER_YEAR
  const spread = Math.max(0, Number(settings.forecastBandSpread) || 0)
  const monthlyInvestment = Math.max(0, Number(settings.monthlyInvestment) || 0)

  // The account the contribution flows into: explicit choice, else highest-return.
  const stored = settings.investmentTargetAccountId
  const targetId =
    stored != null && accounts.some((a) => a.id === stored) ? stored : investmentTargetId(accounts)

  const shared = { accounts, startBalances, months, spread, monthlyInvestment, targetId }
  const baseRun = project({ ...shared, spreadSign: 0 })
  const pessRun = project({ ...shared, spreadSign: -1 })
  const optRun = project({ ...shared, spreadSign: 1 })

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

/**
 * Five evenly-spaced reference values for the readout under the chart:
 * 1-year steps for a 5y horizon, 2-year for 10y, 4-year for 20y.
 * @param points  projectBands() output (index m = month m)
 * @returns Array<{ year:number, value:number }> length 5
 */
export function referencePoints(points, horizonYears) {
  const step = horizonYears / 5
  const out = []
  for (let k = 1; k <= 5; k++) {
    const year = step * k
    out.push({ year, value: points[Math.round(year * MONTHS_PER_YEAR)]?.base ?? 0 })
  }
  return out
}
