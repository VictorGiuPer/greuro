import { db } from './db'

/**
 * Trips — a light travel grouping. Tag transactions with a `tripId` to see how
 * much a holiday cost. A trip is just a name + a day count (used for the
 * spent-per-day figure). Spend is DERIVED from the tagged expense
 * transactions, never stored.
 */

/** All trips, newest first. */
export function getTrips() {
  return db.trips.orderBy('id').reverse().toArray()
}

/** Non-archived trips (what the dashboard card's switcher offers). */
export async function getActiveTrips() {
  const all = await getTrips()
  return all.filter((t) => !t.archived)
}

export async function addTrip(data) {
  const now = Date.now()
  return db.trips.add({
    name: (data.name ?? '').trim(),
    days: Math.max(1, Math.round(Number(data.days) || 1)),
    archived: data.archived ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  })
}

export async function updateTrip(id, patch) {
  const clean = { updatedAt: Date.now() }
  if (patch.name != null) clean.name = String(patch.name).trim()
  if (patch.days != null) clean.days = Math.max(1, Math.round(Number(patch.days) || 1))
  if (patch.archived != null) clean.archived = patch.archived ? 1 : 0
  return db.trips.update(id, clean)
}

/** How many transactions are tagged to a trip (for the delete note). */
export function countTripUsage(id) {
  return db.transactions.where('tripId').equals(id).count()
}

/**
 * Delete a trip and untag its transactions (they keep everything else, just
 * lose the trip tag). Never orphans a tripId.
 */
export async function deleteTrip(id) {
  await db.transaction('rw', db.trips, db.transactions, async () => {
    const tagged = await db.transactions.where('tripId').equals(id).toArray()
    for (const t of tagged) await db.transactions.update(t.id, { tripId: null })
    await db.trips.delete(id)
  })
}

/** Category ids flagged "balance only" — excluded from trip spend too. */
async function excludedCategoryIds() {
  const cats = await db.categories.filter((c) => Boolean(c.excludeFromStats)).toArray()
  return new Set(cats.map((c) => c.id))
}

/**
 * Total expense spend tagged to a trip + the per-day figure.
 * Transfers/income are excluded (a trip's "cost" is what you spent).
 * @returns {{ total, perDay, days, count }}
 */
export async function computeTripSpend(trip) {
  if (!trip) return { total: 0, perDay: 0, days: 0, count: 0 }
  const [txs, excluded] = await Promise.all([
    db.transactions.where('tripId').equals(trip.id).toArray(),
    excludedCategoryIds(),
  ])
  let total = 0
  let count = 0
  for (const t of txs) {
    if (t.type !== 'expense') continue
    if (excluded.has(t.categoryId)) continue
    total += Number(t.amount) || 0
    count += 1
  }
  const days = Math.max(1, Number(trip.days) || 1)
  return { total, perDay: total / days, days, count }
}
