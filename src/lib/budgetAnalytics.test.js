import { describe, expect, it } from 'vitest'
import { budgetAnalytics, calendarTime } from './budgetAnalytics'
import { accountBalances, incomeExpenseTotals, spendingByCategory, cashFlow } from '../db/derive'
import { db } from '../db/testDatabase'
import { applyBudgetAction } from './budgetDomain'
import { allocationHistory } from './savings'

describe('MCP and app financial parity', () => {
  it('resolves Brussels month boundaries across daylight saving', () => {
    expect(new Date(calendarTime(2026, 0, 1)).toISOString()).toBe('2025-12-31T23:00:00.000Z')
    expect(new Date(calendarTime(2026, 6, 1)).toISOString()).toBe('2026-06-30T22:00:00.000Z')
  })
  it('matches the app derivations and includes complete records and savings fields', async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    const date = Date.UTC(2026, 9, 15, 12)
    const d = { accounts: [{ id: 1, type: 'asset', startingBalance: 1000 }, { id: 2, usage: 'investment', startingBalance: 500 }], categories: [{ id: 1, name: 'Food', kind: 'expense' }, { id: 2, name: 'Salary', kind: 'income' }], trips: [{ id: 1, name: 'Japan', days: 5, goalId: 1 }], goals: [{ id: 1, name: 'Japan', targetAmount: 500, earmarked: 300, modelVersion: 2 }], settings: [], scheduled: [], transactions: [
      { id: 1, type: 'income', amount: 2000, date, accountId: 1, categoryId: 2 },
      { id: 2, type: 'expense', amount: 100, date, accountId: 1, categoryId: 1, tripId: 1, goalId: 1, fundedAmount: 100 },
      { id: 3, type: 'transfer', amount: 200, date, fromAccountId: 1, toAccountId: 2 },
    ] }
    for (const name of Object.keys(d)) await db[name].bulkAdd(d[name])
    const options = { asOf: Date.UTC(2026, 9, 20), from: Date.UTC(2026, 9, 1), to: Date.UTC(2026, 9, 31) }
    const result = budgetAnalytics(d, options)
    expect(result.totals).toEqual(await incomeExpenseTotals(options))
    const balances = await accountBalances(options.asOf)
    expect(result.accounts.map((a) => a.balance)).toEqual([...balances.values()])
    expect(result.accounts[0].cashFlow).toEqual(await cashFlow({ accountId: 1, ...options }))
    expect(result.spending.map((c) => ({ categoryId: c.id, total: c.total }))).toEqual(await spendingByCategory(options))
    expect(result.goals[0]).toMatchObject({ spent: 100, earmarked: 300, remaining: 100 })
    expect(result.records).toEqual(d)
    expect(result.allocation).toEqual(allocationHistory(d, options.asOf))
    expect(result.trips[0]).toMatchObject({ total: 100, perDay: 20 })
    expect(result.forecast.points).toHaveLength(61)
  })
})
