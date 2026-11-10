import { balancesFor, allocationHistory, savingsPool, goalProgress, legacyProgress, savingTime, excluded, monthKey, cents, money } from './savings.js'
import { effectiveAmount } from './txAmount.js'
import { projectBands, referencePoints } from './forecast.js'
import { groupOwedTransactions } from './owed.js'
import { SETTINGS_DEFAULTS } from './preferences.js'

// Resolve civil time explicitly, including Brussels daylight-saving transitions.
export function calendarTime(year, month, day = 1, hour = 0, timeZone = 'Europe/Brussels') {
  const normalized = new Date(Date.UTC(year, month, day, hour))
  const desired = normalized.getTime()
  let guess = desired
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(guess).map((p) => [p.type, p.value]))
    const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
    guess += desired - represented
  }
  return guess
}

export function budgetAnalytics(data, options = {}) {
  const asOf = options.asOf ?? Date.now(), timeZone = options.timeZone ?? 'Europe/Brussels'
  const [year, month] = monthKey(asOf, timeZone).split('-').map(Number)
  const from = options.from ?? calendarTime(year, month - 1, 1, 0, timeZone)
  const to = options.to ?? Math.min(asOf, calendarTime(year, month, 1, 0, timeZone) - 1)
  if (from > to) throw new Error('Period start must not exceed its end.')
  const inRange = data.transactions.filter((t) => t.date >= from && t.date <= to && !excluded(t, data))
  const incomeCents = inRange.filter((t) => t.type === 'income').reduce((s, t) => s + cents(effectiveAmount(t)), 0)
  const expenseCents = inRange.filter((t) => t.type === 'expense').reduce((s, t) => s + cents(effectiveAmount(t)), 0)
  const balances = balancesFor(data, asOf)
  const worth = (at) => [...balancesFor(data, at).values()].reduce((s, n) => s + n, 0)
  const settings = { ...SETTINGS_DEFAULTS, ...Object.fromEntries(data.settings.map((s) => [s.key, s.value])) }
  const categories = data.categories.map((c) => ({ ...c, total: money(inRange.filter((t) => t.categoryId === c.id && t.type === c.kind).reduce((s, t) => s + cents(effectiveAmount(t)), 0)) }))
  const accountFlows = data.accounts.map((account) => {
    let inflow = 0, outflow = 0
    for (const tx of inRange) {
      const amount = cents(effectiveAmount(tx))
      if ((tx.type === 'income' && tx.accountId === account.id) || (tx.type === 'transfer' && tx.toAccountId === account.id)) inflow += amount
      if ((tx.type === 'expense' && tx.accountId === account.id) || (tx.type === 'transfer' && tx.fromAccountId === account.id)) outflow += amount
    }
    return { ...account, balance: balances.get(account.id), cashFlow: { inflow: money(inflow), outflow: money(outflow), net: money(inflow - outflow) } }
  })
  const trips = data.trips.map((trip) => {
    const purchases = data.transactions.filter((t) => t.date <= asOf && t.tripId === trip.id && t.type === 'expense' && !excluded(t, data))
    const total = money(purchases.reduce((s, t) => s + cents(effectiveAmount(t)), 0))
    return { ...trip, total, perDay: total / Math.max(1, trip.days), count: purchases.length, purchases }
  })
  const historic = { ...data, transactions: data.transactions.filter((t) => t.date <= asOf) }
  const allocation = allocationHistory(data, asOf, timeZone, { averageMonths: options.averageMonths ?? settings.savingsAverageMonths })
  const goals = data.goals.map((g) => ({ ...g, ...goalProgress(g, historic), legacy: g.modelVersion !== 2 ? legacyProgress(g, data, asOf, timeZone) : null, calculator: savingTime(goalProgress(g, historic).remaining, allocation.at(-1).savings) }))
  const horizon = [5, 10, 20].includes(settings.forecastHorizonYears) ? settings.forecastHorizonYears : 5
  const investments = data.accounts.filter((a) => a.usage === 'investment')
  const projection = investments.length ? projectBands({ accounts: investments, startBalances: balances, horizonYears: horizon, settings, startAt: asOf }) : []
  const [reportYear, reportMonth] = monthKey(from, timeZone).split('-').map(Number)
  const previousFrom = calendarTime(reportYear, reportMonth - 2, 1, 0, timeZone)
  const previousTo = calendarTime(reportYear, reportMonth - 1, 1, 0, timeZone) - 1
  const previousRows = data.transactions.filter((t) => t.date >= previousFrom && t.date <= previousTo && !excluded(t, data))
  const previousIncome = money(previousRows.filter((t) => t.type === 'income').reduce((s, t) => s + cents(effectiveAmount(t)), 0))
  const previousExpense = money(previousRows.filter((t) => t.type === 'expense').reduce((s, t) => s + cents(effectiveAmount(t)), 0))
  const totals = { income: money(incomeCents), expense: money(expenseCents), net: money(incomeCents - expenseCents) }
  const owed = groupOwedTransactions(historic.transactions)
  return {
    asOf, timeZone, range: { from, to }, records: data, settings, accounts: accountFlows, categories,
    pool: savingsPool(data), netWorth: worth(asOf), totals,
    spending: categories.filter((c) => c.kind === 'expense' && c.total !== 0).sort((a, b) => b.total - a.total),
    report: { totals, prevTotals: { income: previousIncome, expense: previousExpense, net: previousIncome - previousExpense }, delta: { income: totals.income - previousIncome, expense: totals.expense - previousExpense, net: totals.net - previousIncome + previousExpense }, netWorthStart: worth(from - 1), netWorthEnd: worth(to), netWorthChange: worth(to) - worth(from - 1) },
    trips, goals, allocation, average: allocation.at(-1), owed,
    owedTotal: money(owed.reduce((s, group) => s + group.outstandingCents, 0)),
    forecast: { settings, accounts: investments, horizonYears: horizon, points: projection, references: referencePoints(projection, horizon) },
    calculator: options.target != null ? savingTime(options.target, allocation.at(-1).savings) : null,
    scheduled: data.scheduled.map((s) => ({ ...s, overdue: s.active !== 0 && s.nextDueDate < asOf, daysUntil: Math.round((s.nextDueDate - asOf) / 86400000) })),
  }
}
