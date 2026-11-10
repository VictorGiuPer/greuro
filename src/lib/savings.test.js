import { describe, it, expect } from 'vitest'
import { allocationHistory, savingsPool, goalProgress, releaseSuggestions, savingTime, balancesFor } from './savings'
const data = () => ({ accounts: [{ id: 1, type: 'asset', startingBalance: 1000 }, { id: 2, usage: 'investment', startingBalance: 5000 }, { id: 3, type: 'asset', startingBalance: 200 }], categories: [], transactions: [], goals: [], trips: [] })
describe('shared savings calculations', () => {
  it('pools cash and bank, excludes investments and debt, and subtracts reservations once', () => {
    const d = data(); d.accounts.push({ id: 4, type: 'liability', startingBalance: 300 }); d.goals.push({ id: 1, modelVersion: 2, earmarked: 400 })
    expect(savingsPool(d)).toEqual({ pooled: 1200, earmarked: 400, available: 800, shortfall: 0 })
  })
  it('preserves funded progress as cash and card purchases consume reservations', () => {
    const d = data(); const g = { id: 1, modelVersion: 2, earmarked: 660, targetAmount: 1000 }; d.goals.push(g)
    d.transactions.push({ id: 1, type: 'expense', goalId: 1, accountId: 1, amount: 300 }, { id: 2, type: 'expense', goalId: 1, accountId: 3, amount: 40 })
    expect(goalProgress(g, d)).toMatchObject({ spent: 340, earmarked: 660, remaining: 0, spentPct: 34, earmarkedPct: 66 })
  })
  it('shows spending overruns and calculates goal time', () => {
    const d = data(); d.transactions.push({ type: 'expense', goalId: 1, amount: 600 })
    expect(goalProgress({ id: 1, modelVersion: 2, targetAmount: 500 }, d).overrun).toBe(100)
    expect(savingTime(101, 50).months).toBe(3); expect(savingTime(100, -10).status).toBe('unreachable')
  })
  it('averages exactly five complete months, keeps deficits signed, and excludes current month', () => {
    const d = data(); const at = Date.UTC(2026, 10, 8, 12)
    d.transactions = [{ type: 'income', amount: 1000, date: Date.UTC(2026, 9, 1, 12) }, { type: 'expense', amount: 1200, date: Date.UTC(2026, 9, 2, 12) }, { type: 'income', amount: 9999, date: Date.UTC(2026, 10, 1, 12) }]
    const rows = allocationHistory(d, at, 'Europe/Brussels', { averageMonths: 5 })
    expect(rows.map((r) => r.key)).toEqual(['2026-09', '2026-10', '2026-11', 'Average'])
    expect(rows[1]).toMatchObject({ savings: -200, percentages: { expenses: 120, investments: 0, savings: -20 } })
    expect(rows[3]).toMatchObject({ income: 200, savings: -40 })
  })
  it('rounds releases up by 25 without a 50 minimum and caps suggestions', () => {
    expect(releaseSuggestions(18, 100)).toEqual([25, 50, 75, 100]); expect(releaseSuggestions(18, 20)).toEqual([20])
  })
  it('keeps the three visible months fixed while changing the completed-month average', () => {
    const d = data(); const at = Date.UTC(2026, 10, 10, 12)
    for (let month = 0; month < 11; month++) d.transactions.push({ type: 'income', amount: 300 * (month + 1), date: Date.UTC(2026, month, 5, 12) })
    d.settings = [{ key: 'savingsAverageMonths', value: 4 }]
    const stored = allocationHistory(d, at)
    expect(stored.map((r) => r.key)).toEqual(['2026-09', '2026-10', '2026-11', 'Average'])
    expect(stored.at(-1)).toMatchObject({ months: 4, fromMonth: '2026-07', toMonth: '2026-10', income: 2550 })
    const twelve = allocationHistory(d, at, 'Europe/Brussels', { averageMonths: 12 })
    expect(twelve.slice(0, 3)).toEqual(stored.slice(0, 3))
    expect(twelve.at(-1)).toMatchObject({ months: 12, fromMonth: '2025-11', toMonth: '2026-10', income: 1375 })
    expect(savingTime(5100, stored.at(-1).savings).months).toBe(2)
    expect(savingTime(5100, twelve.at(-1).savings).months).toBe(4)
  })
  it('excludes both signs of corrections from statistics while retaining actual balances', () => {
    const d = data(); const date = Date.UTC(2026, 9, 10, 12)
    d.categories = [{ id: 1, kind: 'expense', excludeFromStats: true }, { id: 2, kind: 'income', excludeFromStats: true }]
    d.transactions = [
      { type: 'income', accountId: 1, amount: 1000, date },
      { type: 'expense', accountId: 1, amount: 200, date },
      { type: 'income', accountId: 1, amount: 500, date, isAdjustment: 1 },
      { type: 'expense', accountId: 1, amount: 300, date, isAdjustment: 1 },
      { type: 'income', accountId: 1, amount: 250, date, categoryId: 2 },
      { type: 'expense', accountId: 1, amount: 150, date, categoryId: 1 },
    ]
    const rows = allocationHistory(d, Date.UTC(2026, 10, 10))
    expect(rows[1]).toMatchObject({ income: 1000, expenses: 200, savings: 800 })
    expect(balancesFor(d).get(1)).toBe(2100)
    expect(rows.at(-1).savings).toBeCloseTo(800 / 3)
  })
  it('handles the year boundary and undefined percentages without inventing income', () => {
    const d = data()
    d.transactions = [{ type: 'expense', amount: 250, date: Date.UTC(2025, 11, 10, 12) }]
    const rows = allocationHistory(d, Date.UTC(2026, 1, 10, 12))
    expect(rows.map((r) => r.key)).toEqual(['2025-12', '2026-01', '2026-02', 'Average'])
    expect(rows[0]).toMatchObject({ income: 0, expenses: 250, savings: -250, percentages: null })
    expect(rows.at(-1)).toMatchObject({ fromMonth: '2025-11', toMonth: '2026-01', months: 3 })
  })
})
