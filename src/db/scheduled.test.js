import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  addScheduled,
  updateScheduled,
  advanceDueDate,
  postDueScheduled,
  recurrenceLabel,
} from './scheduled'
import { noon } from '../lib/dates'

let acct, savings, cat

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  acct = await db.accounts.add({ name: 'Checking', type: 'asset', startingBalance: 0 })
  savings = await db.accounts.add({ name: 'Savings', type: 'asset', startingBalance: 0 })
  cat = await db.categories.add({ name: 'Housing', kind: 'expense', color: '#fff', icon: 'Home' })
})

function rent(nextDueDate, extra = {}) {
  return {
    type: 'expense',
    amount: 1200,
    description: 'Rent',
    categoryId: cat,
    accountId: acct,
    recurrence: { unit: 'month', interval: 1 },
    nextDueDate,
    ...extra,
  }
}

describe('advanceDueDate', () => {
  it('month-end clamping keeps the anchor day', async () => {
    const id = await addScheduled(rent(noon(2026, 0, 31))) // Jan 31
    const item = await db.scheduled.get(id)
    expect(item.anchorDay).toBe(31)
    const feb = advanceDueDate(item)
    expect(new Date(feb).getDate()).toBe(28)
    const mar = advanceDueDate({ ...item, nextDueDate: feb })
    expect(new Date(mar).getDate()).toBe(31)
  })
  it('weekly and custom intervals', async () => {
    const weekly = { recurrence: { unit: 'week', interval: 1 }, nextDueDate: noon(2026, 6, 6), anchorDay: 6 }
    expect(new Date(advanceDueDate(weekly)).getDate()).toBe(13)
    const every10days = { recurrence: { unit: 'day', interval: 10 }, nextDueDate: noon(2026, 6, 6), anchorDay: 6 }
    expect(new Date(advanceDueDate(every10days)).getDate()).toBe(16)
  })
})

describe('postDueScheduled', () => {
  it('posts a due item once and advances nextDueDate', async () => {
    const today = noon(2026, 6, 6)
    await addScheduled(rent(today))
    const posted = await postDueScheduled(today)
    expect(posted).toBe(1)

    const txs = await db.transactions.toArray()
    expect(txs).toHaveLength(1)
    expect(txs[0]).toMatchObject({ type: 'expense', amount: 1200, description: 'Rent', date: today })

    const [item] = await db.scheduled.toArray()
    expect(item.lastPostedDate).toBe(today)
    expect(item.nextDueDate).toBe(noon(2026, 7, 6))
  })

  it('catches up several missed cycles, dated each due day', async () => {
    const today = noon(2026, 6, 6)
    await addScheduled(rent(noon(2026, 3, 6))) // due since April
    const posted = await postDueScheduled(today)
    expect(posted).toBe(4) // Apr, May, Jun, Jul 6
    const dates = (await db.transactions.toArray()).map((t) => t.date).sort()
    expect(dates).toEqual([noon(2026, 3, 6), noon(2026, 4, 6), noon(2026, 5, 6), noon(2026, 6, 6)])
    const [item] = await db.scheduled.toArray()
    expect(item.nextDueDate).toBe(noon(2026, 7, 6))
  })

  it('never double-posts on repeated runs', async () => {
    const today = noon(2026, 6, 6)
    await addScheduled(rent(today))
    await Promise.all([postDueScheduled(today), postDueScheduled(today)]) // StrictMode-style
    await postDueScheduled(today) // and once more, sequentially
    expect(await db.transactions.count()).toBe(1)
  })

  it('skips inactive items and future items', async () => {
    const today = noon(2026, 6, 6)
    await addScheduled(rent(today, { active: 0 }))
    await addScheduled(rent(noon(2026, 6, 20)))
    expect(await postDueScheduled(today)).toBe(0)
    expect(await db.transactions.count()).toBe(0)
  })

  it('posts transfers with both account sides', async () => {
    const today = noon(2026, 6, 6)
    await addScheduled({
      type: 'transfer',
      amount: 300,
      description: 'Savings plan',
      fromAccountId: acct,
      toAccountId: savings,
      recurrence: { unit: 'month', interval: 1 },
      nextDueDate: today,
    })
    await postDueScheduled(today)
    const [tx] = await db.transactions.toArray()
    expect(tx).toMatchObject({
      type: 'transfer',
      fromAccountId: acct,
      toAccountId: savings,
      categoryId: null,
      accountId: null,
    })
  })
})

describe('updateScheduled', () => {
  it('re-normalizes on type change and refreshes the anchor', async () => {
    const id = await addScheduled(rent(noon(2026, 6, 31)))
    await updateScheduled(id, {
      type: 'transfer',
      fromAccountId: acct,
      toAccountId: savings,
      nextDueDate: noon(2026, 7, 15),
    })
    const item = await db.scheduled.get(id)
    expect(item.categoryId).toBeNull()
    expect(item.accountId).toBeNull()
    expect(item.anchorDay).toBe(15)
  })
})

describe('recurrenceLabel', () => {
  it('labels', () => {
    expect(recurrenceLabel({ unit: 'month', interval: 1 })).toBe('Monthly')
    expect(recurrenceLabel({ unit: 'week', interval: 2 })).toBe('Every 2 weeks')
  })
})
