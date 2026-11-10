import { effectiveAmount } from './txAmount.js'

export const cents = (amount) => Math.round(Number(amount || 0) * 100)
export const money = (amount) => amount / 100
export const isPoolAccount = (account) => account.type !== 'liability' && account.usage !== 'investment'
export const activeEarmark = (goal) => goal.modelVersion === 2 && !goal.archived ? cents(goal.earmarked) : 0
export const excluded = (tx, data) => Boolean(tx.isAdjustment) || data.categories.some((c) => c.id === tx.categoryId && c.excludeFromStats)

export function balancesFor(data, asOf = Infinity) {
  const balances = new Map(data.accounts.map((a) => [a.id, cents(a.startingBalance) * (a.type === 'liability' ? -1 : 1)]))
  for (const tx of data.transactions.filter((t) => t.date <= asOf)) {
    const amount = cents(effectiveAmount(tx))
    const apply = (id, delta) => { if (balances.has(id)) balances.set(id, balances.get(id) + delta) }
    if (tx.type === 'transfer') { apply(tx.fromAccountId, -amount); apply(tx.toAccountId, amount) }
    else apply(tx.accountId, tx.type === 'income' ? amount : -amount)
  }
  return new Map([...balances].map(([id, amount]) => [id, money(amount)]))
}

export function savingsPool(data) {
  const balances = balancesFor(data)
  const pooled = data.accounts.filter(isPoolAccount).reduce((sum, a) => sum + cents(balances.get(a.id)), 0)
  const earmarked = data.goals.reduce((sum, g) => sum + activeEarmark(g), 0)
  return { pooled: money(pooled), earmarked: money(earmarked), available: money(pooled - earmarked), shortfall: money(Math.max(0, earmarked - pooled)) }
}

export function goalProgress(goal, data) {
  const purchases = data.transactions.filter((t) => t.type === 'expense' && t.goalId === goal.id && !excluded(t, data))
  const refunds = data.transactions.filter((t) => t.type === 'income' && purchases.some((p) => p.id === t.refundOfTransactionId))
  const spent = Math.max(0, purchases.reduce((sum, t) => sum + cents(effectiveAmount(t)), 0) - refunds.reduce((sum, t) => sum + cents(t.amount), 0))
  const earmarked = activeEarmark(goal)
  const target = cents(goal.targetAmount)
  return {
    goalId: goal.id, target: money(target), spent: money(spent), earmarked: money(earmarked),
    remaining: money(Math.max(0, target - spent - earmarked)), overrun: money(Math.max(0, spent - target)),
    overfunded: money(Math.max(0, spent + earmarked - target)),
    spentPct: target > 0 ? Math.min(100, spent / target * 100) : 0,
    earmarkedPct: target > 0 ? Math.min(Math.max(0, 100 - spent / target * 100), earmarked / target * 100) : 0,
    reviewRequired: goal.modelVersion !== 2, purchases, refunds,
  }
}

export function monthKey(timestamp, timeZone = 'Europe/Brussels') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(timestamp)
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`
}

export function averageWindowMonths(value) {
  const months = Number(value)
  return Number.isInteger(months) && months >= 1 && months <= 12 ? months : 3
}

export function allocationHistory(data, asOf = Date.now(), timeZone = 'Europe/Brussels', options = {}) {
  const savedWindow = data.settings?.find((setting) => setting.key === 'savingsAverageMonths')?.value
  const averageMonths = averageWindowMonths(options.averageMonths ?? savedWindow)
  const [year, month] = monthKey(asOf, timeZone).split('-').map(Number)
  const investments = new Set(data.accounts.filter((a) => a.usage === 'investment').map((a) => a.id))
  const totals = new Map()
  for (const tx of data.transactions) {
    if (tx.date > asOf || excluded(tx, data)) continue
    const key = monthKey(tx.date, timeZone)
    const total = totals.get(key) || { income: 0, expenses: 0, investments: 0 }
    const amount = cents(effectiveAmount(tx))
    if (tx.type === 'income') total.income += amount
    if (tx.type === 'expense') total.expenses += amount
    if (tx.type === 'transfer') {
      if (investments.has(tx.toAccountId) && !investments.has(tx.fromAccountId)) total.investments += amount
      if (investments.has(tx.fromAccountId) && !investments.has(tx.toAccountId)) total.investments -= amount
    }
    totals.set(key, total)
  }
  const atMonth = (offset) => {
    const key = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7)
    const total = totals.get(key) || { income: 0, expenses: 0, investments: 0 }
    return { key, current: offset === 0, income: money(total.income), expenses: money(total.expenses), investments: money(total.investments), savings: money(total.income - total.expenses - total.investments) }
  }
  // Keep display history independent of the completed-month average window.
  const rows = [-2, -1, 0].map(atMonth)
  const completed = Array.from({ length: averageMonths }, (_, i) => atMonth(i - averageMonths))
  const average = { key: 'Average', current: false, months: averageMonths, fromMonth: completed[0].key, toMonth: completed.at(-1).key }
  for (const name of ['income', 'expenses', 'investments', 'savings']) average[name] = completed.reduce((sum, r) => sum + r[name], 0) / averageMonths
  return [...rows, average].map((r) => {
    if (r.income <= 0) return { ...r, percentages: null }
    const expenses = Math.round(r.expenses / r.income * 1000) / 10
    const investments = Math.round(r.investments / r.income * 1000) / 10
    return { ...r, percentages: { expenses, investments, savings: Math.round((100 - expenses - investments) * 10) / 10 } }
  })
}

export function savingTime(remaining, monthlySavings) {
  if (remaining <= 0) return { status: 'reached', months: 0 }
  if (monthlySavings <= 0) return { status: 'unreachable', months: null }
  return { status: 'saving', months: Math.ceil(remaining / monthlySavings) }
}

export function releaseSuggestions(shortfall, earmarked) {
  const first = Math.ceil(cents(shortfall) / 2500) * 2500
  return [...new Set([first, first + 2500, first + 5000, cents(earmarked)].filter((v) => v > 0 && v <= cents(earmarked)))].map(money)
}

export function legacyProgress(goal, data, asOf = Date.now(), timeZone = 'Europe/Brussels') {
  const stored = data.settings.find((s) => s.key === 'mainAccountId')?.value
  const mainId = data.accounts.some((a) => a.id === stored) ? stored : data.accounts.find(isPoolAccount)?.id
  const currentKey = monthKey(asOf, timeZone)
  const flows = new Map()
  for (const tx of data.transactions) {
    if (excluded(tx, data)) continue
    const key = monthKey(tx.date, timeZone)
    let delta = 0
    const amount = cents(effectiveAmount(tx))
    if ((tx.type === 'income' && tx.accountId === mainId) || (tx.type === 'transfer' && tx.toAccountId === mainId)) delta += amount
    if ((tx.type === 'expense' && tx.accountId === mainId) || (tx.type === 'transfer' && tx.fromAccountId === mainId)) delta -= amount
    flows.set(key, (flows.get(key) || 0) + delta)
  }
  let accumulated = 0, monthsElapsed = 0
  let year = goal.startYear, month = goal.startMonth
  if (mainId != null && Number.isInteger(year) && Number.isInteger(month)) {
    for (let guard = 0; guard < 1200; guard++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}`
      if (key >= currentKey) break
      accumulated = Math.max(0, accumulated + (flows.get(key) || 0)); monthsElapsed++
      month++; if (month > 11) { month = 0; year++ }
    }
  }
  return { suggestedEarmark: money(Math.max(0, accumulated + cents(goal.manualAdjustment))), accumulated: money(accumulated), manualAdjustment: Number(goal.manualAdjustment) || 0, monthsElapsed, currentMonthNet: money(flows.get(currentKey) || 0), mainAccountId: mainId ?? null }
}
