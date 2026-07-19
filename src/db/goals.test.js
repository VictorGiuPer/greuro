import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { addGoal, getActiveGoal, updateGoal, computeGoalProgress } from './goals'
import { noon } from '../lib/dates'

let main, other, food, salary, adjust

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

// "Now" fixed to 15 Apr 2026 so Jan–Mar 2026 are completed months.
const NOW = noon(2026, 3, 15)

beforeEach(async () => {
  await clearAll()
  main = await db.accounts.add({ name: 'Checking', type: 'asset', startingBalance: 0, usage: 'active' })
  other = await db.accounts.add({ name: 'Depot', type: 'asset', startingBalance: 0, usage: 'investment' })
  food = await db.categories.add({ name: 'Food', kind: 'expense', color: '#fff', icon: 'Utensils' })
  salary = await db.categories.add({ name: 'Salary', kind: 'income', color: '#fff', icon: 'Briefcase' })
  adjust = await db.categories.add({ name: 'Adjust', kind: 'expense', color: '#fff', icon: 'Circle', excludeFromStats: true })
})

function tx(row) {
  return db.transactions.add({
    categoryId: null, accountId: null, fromAccountId: null, toAccountId: null, ...row,
  })
}

describe('computeGoalProgress', () => {
  it('accumulates each completed month net (income − spending − invested)', async () => {
    // Jan: +2000 income, -500 food, -300 transfer to investment → net +1200
    await tx({ type: 'income', amount: 2000, date: noon(2026, 0, 5), categoryId: salary, accountId: main })
    await tx({ type: 'expense', amount: 500, date: noon(2026, 0, 10), categoryId: food, accountId: main })
    await tx({ type: 'transfer', amount: 300, date: noon(2026, 0, 20), fromAccountId: main, toAccountId: other })
    // Feb: +2000 income, -600 food → net +1400
    await tx({ type: 'income', amount: 2000, date: noon(2026, 1, 5), categoryId: salary, accountId: main })
    await tx({ type: 'expense', amount: 600, date: noon(2026, 1, 10), categoryId: food, accountId: main })
    // Mar: +2000 income, -100 food → net +1900
    await tx({ type: 'income', amount: 2000, date: noon(2026, 2, 5), categoryId: salary, accountId: main })
    await tx({ type: 'expense', amount: 100, date: noon(2026, 2, 10), categoryId: food, accountId: main })

    const id = await addGoal({ name: 'Trip', targetAmount: 5000, startYear: 2026, startMonth: 0 })
    const goal = await db.goals.get(id)
    const p = await computeGoalProgress(goal, main, NOW)

    expect(p.monthsElapsed).toBe(3) // Jan, Feb, Mar (Apr is current/partial)
    expect(p.saved).toBe(1200 + 1400 + 1900)
    expect(p.target).toBe(5000)
    expect(p.remaining).toBe(500)
    expect(p.done).toBe(false)
  })

  it('a negative month subtracts, and the running total floors at 0', async () => {
    // Jan net +200; Feb net -1000 (overspend) → running max(0, 200-1000)=0
    await tx({ type: 'income', amount: 200, date: noon(2026, 0, 5), categoryId: salary, accountId: main })
    await tx({ type: 'expense', amount: 1000, date: noon(2026, 1, 5), categoryId: food, accountId: main })
    // Mar net +400 → saved 400
    await tx({ type: 'income', amount: 400, date: noon(2026, 2, 5), categoryId: salary, accountId: main })

    const id = await addGoal({ name: 'Camera', targetAmount: 1000, startYear: 2026, startMonth: 0 })
    const p = await computeGoalProgress(await db.goals.get(id), main, NOW)
    expect(p.saved).toBe(400)
  })

  it('ignores months before the start month', async () => {
    await tx({ type: 'income', amount: 999, date: noon(2026, 0, 5), categoryId: salary, accountId: main }) // Jan
    await tx({ type: 'income', amount: 500, date: noon(2026, 2, 5), categoryId: salary, accountId: main }) // Mar

    const id = await addGoal({ name: 'Late', targetAmount: 1000, startYear: 2026, startMonth: 2 }) // starts Mar
    const p = await computeGoalProgress(await db.goals.get(id), main, NOW)
    expect(p.monthsElapsed).toBe(1) // only Mar
    expect(p.saved).toBe(500)
  })

  it('current partial month is reported but not counted in saved', async () => {
    await tx({ type: 'income', amount: 700, date: noon(2026, 3, 3), categoryId: salary, accountId: main }) // Apr = current
    const id = await addGoal({ name: 'X', targetAmount: 1000, startYear: 2026, startMonth: 3 })
    const p = await computeGoalProgress(await db.goals.get(id), main, NOW)
    expect(p.monthsElapsed).toBe(0)
    expect(p.saved).toBe(0)
    expect(p.currentMonthNet).toBe(700)
  })

  it('balance-only categories do not affect the goal', async () => {
    await tx({ type: 'income', amount: 1000, date: noon(2026, 0, 5), categoryId: salary, accountId: main })
    await tx({ type: 'expense', amount: 5000, date: noon(2026, 0, 6), categoryId: adjust, accountId: main }) // excluded
    const id = await addGoal({ name: 'Y', targetAmount: 1000, startYear: 2026, startMonth: 0 })
    const p = await computeGoalProgress(await db.goals.get(id), main, NOW)
    expect(p.saved).toBe(1000) // adjustment ignored
  })

  it('marks done when target reached, pct clamps to 100', async () => {
    await tx({ type: 'income', amount: 3000, date: noon(2026, 0, 5), categoryId: salary, accountId: main })
    const id = await addGoal({ name: 'Z', targetAmount: 1000, startYear: 2026, startMonth: 0 })
    const p = await computeGoalProgress(await db.goals.get(id), main, NOW)
    expect(p.done).toBe(true)
    expect(p.pct).toBe(100)
  })

  it('no main account → noMain flag, nothing saved', async () => {
    const id = await addGoal({ name: 'NoMain', targetAmount: 500, startYear: 2026, startMonth: 0 })
    const p = await computeGoalProgress(await db.goals.get(id), null, NOW)
    expect(p.noMain).toBe(true)
    expect(p.saved).toBe(0)
  })
})

describe('getActiveGoal / archive', () => {
  it('returns the newest non-archived goal', async () => {
    await addGoal({ name: 'Old', targetAmount: 100, startYear: 2026, startMonth: 0, archived: true })
    const activeId = await addGoal({ name: 'Current', targetAmount: 200, startYear: 2026, startMonth: 0 })
    const active = await getActiveGoal()
    expect(active.id).toBe(activeId)
    expect(active.name).toBe('Current')

    await updateGoal(activeId, { archived: true })
    expect(await getActiveGoal()).toBeNull()
  })
})
