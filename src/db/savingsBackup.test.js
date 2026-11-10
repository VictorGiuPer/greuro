import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { applyBackup, buildBackup } from './backup'
import { goalProgress, savingsPool } from '../lib/savings'

const backup = () => ({ format: 'budget-app-backup', version: 1, exportedAt: '2026-11-08', data: {
  accounts: [{ id: 50, name: 'Bank', type: 'asset', startingBalance: 2000 }],
  categories: [{ id: 9, name: 'Travel', kind: 'expense' }, { id: 10, name: 'Refund', kind: 'income' }],
  goals: [{ id: 40, name: 'Japan', targetAmount: 1000, modelVersion: 2, earmarked: 350 }],
  trips: [{ id: 60, name: 'Japan trip', days: 10, goalId: 40 }],
  transactions: [{ id: 70, type: 'expense', amount: 200, date: 1000, accountId: 50, categoryId: 9, tripId: 60, goalId: 40, fundedAmount: 200, historicalFunding: 0 }, { id: 71, type: 'income', amount: 50, date: 2000, accountId: 50, categoryId: 10, refundOfTransactionId: 70, goalId: 40, fundingRestored: 50 }],
  scheduled: [{ id: 80, type: 'expense', amount: 10, accountId: 50, categoryId: 9, tripId: 60, goalId: 40 }], settings: [],
} })
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })
describe('savings backup compatibility', () => {
  it('round-trips all savings and refund fields exactly', async () => {
    const source = backup()
    await applyBackup(source, 'replace')
    const exported = await buildBackup()
    expect(exported.data).toEqual(source.data)
    expect(goalProgress(exported.data.goals[0], exported.data)).toMatchObject({ spent: 150, earmarked: 350, remaining: 500 })
  })
  it('remaps goals, trips, purchases, refunds and schedule links on merge', async () => {
    await db.accounts.add({ id: 1, name: 'Existing', startingBalance: 10 })
    await db.goals.add({ id: 1, name: 'Existing goal', targetAmount: 10, modelVersion: 2, earmarked: 0 })
    await db.transactions.add({ id: 1, type: 'income', amount: 1, date: 1, accountId: 1 })
    await applyBackup(backup(), 'merge')
    const { data } = await buildBackup()
    const goal = data.goals.find((g) => g.name === 'Japan')
    const trip = data.trips[0]
    const purchase = data.transactions.find((t) => t.type === 'expense')
    const refund = data.transactions.find((t) => t.refundOfTransactionId)
    expect(goal.id).not.toBe(40); expect(trip.goalId).toBe(goal.id)
    expect(purchase.goalId).toBe(goal.id); expect(purchase.tripId).toBe(trip.id)
    expect(refund.refundOfTransactionId).toBe(purchase.id); expect(refund.goalId).toBe(goal.id)
    expect(data.scheduled[0]).toMatchObject({ accountId: purchase.accountId, categoryId: purchase.categoryId, tripId: trip.id, goalId: goal.id })
    expect(goalProgress(goal, data).spent).toBe(150)
  })
  it('marks insufficient restored backing for explicit release resolution', async () => {
    const source = backup(); source.data.accounts[0].startingBalance = 200
    await applyBackup(source, 'replace')
    const { data } = await buildBackup()
    expect(savingsPool(data).shortfall).toBe(300)
    expect(data.settings).toContainEqual({ key: 'savingsResolutionRequired', value: true })
    expect(data.goals[0].earmarked).toBe(350)
  })
})
