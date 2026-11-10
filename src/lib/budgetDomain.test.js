import { describe, it, expect } from 'vitest'
import { applyBudgetAction } from './budgetDomain'
import { goalProgress, savingsPool } from './savings'
const initial = () => ({ accounts: [{ id: 1, name: 'Bank', type: 'asset', startingBalance: 1800 }, { id: 2, name: 'Cash', type: 'asset', startingBalance: 200 }, { id: 3, name: 'Investment', usage: 'investment', startingBalance: 0 }], categories: [{ id: 1, name: 'Travel', kind: 'expense' }, { id: 2, name: 'Refund', kind: 'income' }], transactions: [], trips: [{ id: 1, name: 'Japan', days: 5, goalId: 1 }], goals: [{ id: 1, name: 'Japan', targetAmount: 1000, modelVersion: 2, earmarked: 1000, archived: 0 }], scheduled: [], settings: [] })
const purchase = (amount, accountId = 1) => ({ type: 'expense', amount, accountId, categoryId: 1, tripId: 1, date: 1000, description: 'Trip purchase' })
const act = (d, name, input, options) => applyBudgetAction(d, name, input, options).data
describe('atomic savings domain', () => {
  it('consumes cash and card spending without creating transfers', () => {
    let d = act(initial(), 'transaction.add', purchase(300))
    d = act(d, 'transaction.add', purchase(40, 2))
    expect(d.transactions).toHaveLength(2)
    expect(goalProgress(d.goals[0], d)).toMatchObject({ spent: 340, earmarked: 660, remaining: 0 })
    expect(savingsPool(d)).toMatchObject({ available: 1000 })
  })
  it('requires explicit release and rolls back the input snapshot', () => {
    const d = initial()
    expect(() => act(d, 'transaction.add', { ...purchase(1100), goalId: null })).toThrow('Release reserved')
    expect(d.transactions).toHaveLength(0); expect(d.goals[0].earmarked).toBe(1000)
    const saved = act(d, 'transaction.add', { ...purchase(1100), goalId: null, releases: [{ goalId: 1, amount: 100 }] })
    expect(savingsPool(saved).available).toBe(0)
  })
  it('protects reservations when transferring into investments, but permits pool transfers', () => {
    const transfer = { type: 'transfer', fromAccountId: 1, toAccountId: 3, amount: 1100, date: 1000 }
    expect(() => act(initial(), 'transaction.add', transfer)).toThrow('Release reserved')
    expect(savingsPool(act(initial(), 'transaction.add', { ...transfer, toAccountId: 2 })).available).toBe(1000)
  })
  it('counts historical purchases without consuming reservations and does not double import', () => {
    let d = act(initial(), 'transaction.add', { ...purchase(300), goalId: null })
    d = act(d, 'trip.assign', { id: 1, goalId: 1, transactionIds: [1], confirm: true })
    expect(d.goals[0].earmarked).toBe(1000); expect(d.transactions[0].fundedAmount).toBe(0)
    d = act(d, 'trip.assign', { id: 1, goalId: 1, transactionIds: [1], confirm: true })
    expect(goalProgress(d.goals[0], d).spent).toBe(300)
  })
  it('reverses edits, deletes, and reimbursements without restoring twice', () => {
    let d = act(initial(), 'transaction.add', { ...purchase(300), reimbursable: 1, owedAmount: 100 })
    d = act(d, 'transaction.update', { id: 1, fields: { resolved: 1 } })
    expect(d.goals[0].earmarked).toBe(800)
    d = act(d, 'transaction.update', { id: 1, fields: { resolved: 1 } })
    expect(d.goals[0].earmarked).toBe(800)
    d = act(d, 'transaction.delete', { id: 1 })
    expect(d.goals[0].earmarked).toBe(1000)
  })
  it('restores only funded money on refunds, prevents over-refunds, and supports deletion', () => {
    let d = act(initial(), 'transaction.add', purchase(300))
    const refund = { type: 'income', amount: 100, accountId: 1, categoryId: 2, refundOfTransactionId: 1, date: 2000 }
    d = act(d, 'transaction.add', refund)
    expect(d.goals[0].earmarked).toBe(800)
    expect(goalProgress(d.goals[0], d).spent).toBe(200)
    expect(() => act(d, 'transaction.add', { ...refund, amount: 250 })).toThrow('Refunds cannot exceed')
    d = act(d, 'transaction.update', { id: 2, fields: { amount: 50 } })
    expect(d.goals[0].earmarked).toBe(750)
    d = act(d, 'transaction.delete', { id: 2 })
    expect(d.goals[0].earmarked).toBe(700)
  })
  it('finishes every linked trip, releases money, and reopens without restoring it', () => {
    let d = initial(); d.trips.push({ id: 2, name: 'Second trip', goalId: 1, days: 2 })
    d = act(d, 'goal.finish', { id: 1, confirm: true })
    expect(d.goals[0]).toMatchObject({ earmarked: 0, archived: 1 })
    expect(d.trips.every((t) => t.archived)).toBe(true)
    d = act(d, 'goal.reopen', { id: 1, confirm: true })
    expect(d.goals[0]).toMatchObject({ earmarked: 0, archived: 0 })
  })
  it('allows scheduled shortfalls only explicitly and resolves through releases', () => {
    let d = act(initial(), 'transaction.add', { ...purchase(1100), goalId: null }, { allowShortfall: true })
    expect(savingsPool(d).shortfall).toBe(100)
    d = act(d, 'pool.resolve', { releases: [{ goalId: 1, amount: 100 }] })
    expect(savingsPool(d).shortfall).toBe(0)
  })
  it('reviews legacy goals once, enforcing real funds', () => {
    const d = initial(); delete d.goals[0].modelVersion; delete d.goals[0].earmarked
    expect(() => act(d, 'goal.review', { id: 1, amount: 3000 })).toThrow('Release reserved')
    const reviewed = act(d, 'goal.review', { id: 1, amount: 1000 })
    expect(() => act(reviewed, 'goal.review', { id: 1, amount: 1000 })).toThrow('already reviewed')
  })
  it('does not consume later top-ups when editing an originally unearmarked purchase', () => {
    const source = initial(); source.goals[0].earmarked = 0
    let d = act(source, 'transaction.add', purchase(300))
    d = act(d, 'goal.reserve', { id: 1, amount: 700 })
    d = act(d, 'transaction.update', { id: 1, fields: { description: 'Corrected flights' } })
    expect(d.goals[0].earmarked).toBe(700); expect(d.transactions[0].fundedAmount).toBe(0)
    d = act(d, 'transaction.update', { id: 1, fields: { amount: 350 } })
    expect(d.goals[0].earmarked).toBe(650); expect(d.transactions[0].fundedAmount).toBe(50)
  })
  it('preserves funding history without recreating closed reservations on reopen and correction', () => {
    let d = act(initial(), 'transaction.add', purchase(300))
    d = act(d, 'transaction.add', { type: 'income', amount: 50, accountId: 1, categoryId: 2, date: 2000, refundOfTransactionId: 1 })
    d = act(d, 'goal.finish', { id: 1, confirm: true })
    d = act(d, 'goal.reopen', { id: 1, confirm: true })
    d = act(d, 'transaction.update', { id: 1, fields: { description: 'Corrected after trip' } })
    expect(d.goals[0].earmarked).toBe(0); expect(d.transactions[0].fundedAmount).toBe(300)
    d = act(d, 'transaction.delete', { id: 2 })
    d = act(d, 'transaction.delete', { id: 1 })
    expect(d.goals[0].earmarked).toBe(0)
  })
})
