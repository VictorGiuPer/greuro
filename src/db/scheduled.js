import { db } from './db'
import { addDays, addMonthsClamped, todayNoon } from '../lib/dates'

/**
 * Scheduled (recurring) transactions — the data behind the Reminders tab.
 * Each row is a transaction template + recurrence. When the app opens,
 * postDueScheduled() writes real transactions for every due cycle and
 * advances nextDueDate (see below).
 *
 * `active` is stored as 1|0 (IndexedDB can't index booleans).
 */

function normalizeScheduled(data) {
  const type = data.type
  const base = {
    type,
    amount: Number(data.amount),
    description: (data.description ?? '').trim(),
    categoryId: null,
    accountId: null,
    fromAccountId: null,
    toAccountId: null,
    recurrence: {
      unit: data.recurrence?.unit ?? 'month',
      interval: Math.max(1, Math.round(Number(data.recurrence?.interval) || 1)),
    },
    nextDueDate: Number(data.nextDueDate),
    // Day-of-month anchor for clamped monthly/yearly advancement.
    anchorDay: new Date(Number(data.nextDueDate)).getDate(),
    active: data.active === 0 || data.active === false ? 0 : 1,
  }
  if (type === 'transfer') {
    base.fromAccountId = data.fromAccountId ?? null
    base.toAccountId = data.toAccountId ?? null
  } else {
    base.categoryId = data.categoryId ?? null
    base.accountId = data.accountId ?? null
  }
  return base
}

/** All scheduled items, soonest due first. */
export function getScheduled() {
  return db.scheduled.orderBy('nextDueDate').toArray()
}

export async function addScheduled(data) {
  const now = Date.now()
  const row = {
    ...normalizeScheduled(data),
    startDate: Number(data.nextDueDate),
    lastPostedDate: null,
    createdAt: now,
    updatedAt: now,
  }
  return db.scheduled.add(row)
}

export async function updateScheduled(id, patch) {
  const existing = await db.scheduled.get(id)
  if (!existing) return
  const merged = normalizeScheduled({ ...existing, ...patch })
  return db.scheduled.update(id, { ...merged, updatedAt: Date.now() })
}

export async function deleteScheduled(id) {
  return db.scheduled.delete(id)
}

/** The due date following `item.nextDueDate` per its recurrence. */
export function advanceDueDate(item) {
  const { unit, interval } = item.recurrence
  const from = item.nextDueDate
  if (unit === 'day') return addDays(from, interval)
  if (unit === 'week') return addDays(from, 7 * interval)
  if (unit === 'month') return addMonthsClamped(from, interval, item.anchorDay)
  if (unit === 'year') return addMonthsClamped(from, 12 * interval, item.anchorDay)
  throw new Error(`Unknown recurrence unit: ${unit}`)
}

/** Human label for a recurrence, e.g. "Monthly", "Every 2 weeks". */
export function recurrenceLabel({ unit, interval }) {
  if (interval === 1) {
    return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[unit]
  }
  return `Every ${interval} ${unit}s`
}

// In-flight guard: React StrictMode mounts effects twice in dev; both calls
// share one run so a cycle can never post twice.
let inFlight = null

/**
 * Auto-post every ACTIVE scheduled item whose nextDueDate is today or past.
 * Catches up multiple missed cycles (each posts a transaction dated its own
 * due day). Posting the transaction and advancing nextDueDate happen in ONE
 * readwrite Dexie transaction, so a concurrent/repeat run finds nothing due —
 * no double-posting.
 *
 * @returns {Promise<number>} how many transactions were written
 */
export function postDueScheduled(now = todayNoon()) {
  if (!inFlight) {
    inFlight = runAutoPost(now).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

async function runAutoPost(now) {
  let posted = 0
  await db.transaction('rw', db.scheduled, db.transactions, async () => {
    const due = await db.scheduled
      .where('nextDueDate')
      .belowOrEqual(now)
      .and((s) => s.active === 1)
      .toArray()

    const stamp = Date.now()
    for (const item of due) {
      let next = item.nextDueDate
      let last = item.lastPostedDate
      while (next <= now) {
        await db.transactions.add({
          type: item.type,
          amount: item.amount,
          date: next,
          description: item.description,
          categoryId: item.categoryId,
          accountId: item.accountId,
          fromAccountId: item.fromAccountId,
          toAccountId: item.toAccountId,
          createdAt: stamp,
          updatedAt: stamp,
        })
        posted += 1
        last = next
        const advanced = advanceDueDate({ ...item, nextDueDate: next })
        if (advanced <= next) break // safety: recurrence must move forward
        next = advanced
      }
      await db.scheduled.update(item.id, {
        nextDueDate: next,
        lastPostedDate: last,
        updatedAt: stamp,
      })
    }
  })
  return posted
}
