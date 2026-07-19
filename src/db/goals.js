import { db } from './db'
import { cashFlow } from './derive'
import { monthRange } from '../lib/dates'

/**
 * Savings goals. Progress is DERIVED from the main account's monthly cash
 * flow, never stored — so it always reflects the latest completed month with
 * no background job. Each completed calendar month since the goal started
 * contributes its net cash flow (income − spending − money moved to
 * investments; balance-only categories already excluded). Negative months
 * subtract, and the running total is floored at 0 (you can't bank less than
 * nothing). The current, partial month is reported separately as "so far".
 */

/** All goals, newest first. */
export function getGoals() {
  return db.goals.orderBy('id').reverse().toArray()
}

/** The single active (non-archived) goal, or null. Newest wins if several. */
export async function getActiveGoal() {
  const all = await db.goals.orderBy('id').reverse().toArray()
  return all.find((g) => !g.archived) ?? null
}

export async function addGoal(data) {
  const now = Date.now()
  return db.goals.add({
    name: (data.name ?? '').trim(),
    targetAmount: Number(data.targetAmount) || 0,
    startYear: Number(data.startYear),
    startMonth: Number(data.startMonth), // 0-based month index
    archived: data.archived ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  })
}

export async function updateGoal(id, patch) {
  const clean = { updatedAt: Date.now() }
  if (patch.name != null) clean.name = String(patch.name).trim()
  if (patch.targetAmount != null) clean.targetAmount = Number(patch.targetAmount) || 0
  if (patch.startYear != null) clean.startYear = Number(patch.startYear)
  if (patch.startMonth != null) clean.startMonth = Number(patch.startMonth)
  if (patch.archived != null) clean.archived = patch.archived ? 1 : 0
  return db.goals.update(id, clean)
}

export async function deleteGoal(id) {
  return db.goals.delete(id)
}

/**
 * Compute a goal's saved-so-far from the main account's monthly cash flow.
 * @param goal          the goal row
 * @param mainAccountId account whose surplus feeds the goal (null → nothing)
 * @param nowMs         "now" (injectable for tests)
 * @returns {{ saved, target, remaining, pct, monthsElapsed, currentMonthNet, done, noMain }}
 */
export async function computeGoalProgress(goal, mainAccountId, nowMs = Date.now()) {
  const target = Number(goal?.targetAmount) || 0
  if (mainAccountId == null) {
    return {
      saved: 0, target, remaining: target, pct: 0,
      monthsElapsed: 0, currentMonthNet: 0, done: false, noMain: true,
    }
  }

  const now = new Date(nowMs)
  const curY = now.getFullYear()
  const curM = now.getMonth()

  let y = goal.startYear
  let m = goal.startMonth
  let saved = 0
  let monthsElapsed = 0
  let guard = 0
  // Completed calendar months: start (inclusive) up to current (exclusive).
  while ((y < curY || (y === curY && m < curM)) && guard < 1200) {
    const range = monthRange(y, m)
    const { net } = await cashFlow({ accountId: mainAccountId, from: range.from, to: range.to })
    saved = Math.max(0, saved + net)
    monthsElapsed += 1
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
    guard += 1
  }

  // Current partial month — shown as "this month so far", not yet banked.
  const curRange = monthRange(curY, curM)
  const { net: currentMonthNet } = await cashFlow({
    accountId: mainAccountId,
    from: curRange.from,
    to: curRange.to,
  })

  return {
    saved,
    target,
    remaining: Math.max(0, target - saved),
    pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0,
    monthsElapsed,
    currentMonthNet,
    done: target > 0 && saved >= target,
    noMain: false,
  }
}
