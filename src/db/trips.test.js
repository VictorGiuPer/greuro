import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  addTrip,
  updateTrip,
  deleteTrip,
  getActiveTrips,
  countTripUsage,
  computeTripSpend,
} from './trips'
import { addTransaction } from './transactions'
import { noon } from '../lib/dates'

let acct, food, adjust

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  acct = await db.accounts.add({ name: 'Checking', type: 'asset', startingBalance: 0 })
  food = await db.categories.add({ name: 'Food', kind: 'expense', color: '#fff', icon: 'Utensils' })
  adjust = await db.categories.add({ name: 'Adj', kind: 'expense', color: '#fff', icon: 'Circle', excludeFromStats: true })
})

describe('trip CRUD', () => {
  it('normalizes name/days and clamps days to >= 1', async () => {
    const id = await addTrip({ name: '  Japan  ', days: 0 })
    const t = await db.trips.get(id)
    expect(t.name).toBe('Japan')
    expect(t.days).toBe(1)
    expect(t.archived).toBe(0)
  })

  it('getActiveTrips hides archived', async () => {
    await addTrip({ name: 'Old', days: 5, archived: true })
    const cur = await addTrip({ name: 'Now', days: 7 })
    const active = await getActiveTrips()
    expect(active.map((t) => t.id)).toEqual([cur])
  })
})

describe('computeTripSpend', () => {
  it('sums tagged expenses only, excludes balance-only, and divides by days', async () => {
    const id = await addTrip({ name: 'Trip', days: 4 })
    const trip = await db.trips.get(id)
    // Tagged expenses count.
    await addTransaction({ type: 'expense', amount: 200, date: noon(2026, 5, 1), categoryId: food, accountId: acct, tripId: id })
    await addTransaction({ type: 'expense', amount: 100, date: noon(2026, 5, 2), categoryId: food, accountId: acct, tripId: id })
    // Income tagged to the trip does NOT count as spend.
    await addTransaction({ type: 'income', amount: 999, date: noon(2026, 5, 3), categoryId: food, accountId: acct, tripId: id })
    // Balance-only category is excluded.
    await addTransaction({ type: 'expense', amount: 500, date: noon(2026, 5, 4), categoryId: adjust, accountId: acct, tripId: id })
    // Untagged expense is ignored.
    await addTransaction({ type: 'expense', amount: 50, date: noon(2026, 5, 5), categoryId: food, accountId: acct })

    const spend = await computeTripSpend(trip)
    expect(spend.total).toBe(300)
    expect(spend.count).toBe(2)
    expect(spend.days).toBe(4)
    expect(spend.perDay).toBe(75)
  })

  it('handles a trip with no spend', async () => {
    const id = await addTrip({ name: 'Empty', days: 3 })
    const spend = await computeTripSpend(await db.trips.get(id))
    expect(spend).toEqual({ total: 0, perDay: 0, days: 3, count: 0 })
  })
})

describe('deleteTrip untags its transactions', () => {
  it('clears tripId rather than orphaning or blocking', async () => {
    const id = await addTrip({ name: 'Trip', days: 2 })
    await addTransaction({ type: 'expense', amount: 10, date: noon(2026, 5, 1), categoryId: food, accountId: acct, tripId: id })
    await addTransaction({ type: 'expense', amount: 20, date: noon(2026, 5, 2), categoryId: food, accountId: acct, tripId: id })
    expect(await countTripUsage(id)).toBe(2)

    await deleteTrip(id)
    expect(await db.trips.get(id)).toBeUndefined()
    const remaining = await db.transactions.toArray()
    expect(remaining).toHaveLength(2)
    expect(remaining.every((t) => t.tripId == null)).toBe(true)
  })
})

describe('updateTrip', () => {
  it('updates fields', async () => {
    const id = await addTrip({ name: 'A', days: 3 })
    await updateTrip(id, { name: 'B', days: 9, archived: true })
    const t = await db.trips.get(id)
    expect(t).toMatchObject({ name: 'B', days: 9, archived: 1 })
  })
})
