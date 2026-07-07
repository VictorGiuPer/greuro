/**
 * Date/period helpers. No date library — everything is hand-rolled around the
 * app's LOCAL NOON convention (transactions store ms timestamps at local
 * 12:00 so day-grouping is timezone/DST stable).
 *
 * Period ranges are returned as { from, to } in ms where `from` is 00:00:00.000
 * local on the first day and `to` is 23:59:59.999 local on the last day, so
 * noon-stamped transactions always fall inside inclusive comparisons.
 */

/** Local noon for a given year / month-index / day (DST-safe day anchor). */
export function noon(y, mIdx, d) {
  return new Date(y, mIdx, d, 12, 0, 0, 0).getTime()
}

/** Today at local noon. */
export function todayNoon() {
  const n = new Date()
  return noon(n.getFullYear(), n.getMonth(), n.getDate())
}

/** ms -> start of that local day (00:00:00.000). */
export function startOfDayMs(ts) {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
}

/** ms -> end of that local day (23:59:59.999). */
export function endOfDayMs(ts) {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()
}

/** Add whole days to a timestamp, preserving its time-of-day (DST-safe). */
export function addDays(ts, n) {
  const d = new Date(ts)
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + n,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  ).getTime()
}

/** Days in a given month (month-index). */
export function daysInMonth(y, mIdx) {
  return new Date(y, mIdx + 1, 0).getDate()
}

/**
 * Add `n` months to a noon timestamp, clamping the day-of-month to
 * `anchorDay` (or the month's last day if shorter). This keeps monthly
 * recurrences anchored: Jan 31 -> Feb 28 -> Mar 31 (anchorDay = 31).
 */
export function addMonthsClamped(ts, n, anchorDay) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const mIdx = d.getMonth() + n
  const anchor = anchorDay ?? d.getDate()
  const targetY = y + Math.floor(mIdx / 12)
  const targetM = ((mIdx % 12) + 12) % 12
  const day = Math.min(anchor, daysInMonth(targetY, targetM))
  return noon(targetY, targetM, day)
}

/** Whole calendar days from today until `ts` (negative = past). */
export function daysUntil(ts) {
  const DAY = 24 * 60 * 60 * 1000
  return Math.round((startOfDayMs(ts) - startOfDayMs(Date.now())) / DAY)
}

/**
 * Calendar period containing `refMs`.
 * kind: 'week' (Monday-start) | 'month' | 'quarter' | 'year'
 * Returns { kind, from, to, ref }.
 */
export function periodRange(kind, refMs = Date.now()) {
  const d = new Date(refMs)
  const y = d.getFullYear()
  const m = d.getMonth()
  let from
  let to
  if (kind === 'week') {
    // Monday-start week (German convention). getDay(): Sun=0..Sat=6.
    const dow = (d.getDay() + 6) % 7 // Mon=0..Sun=6
    from = new Date(y, m, d.getDate() - dow, 0, 0, 0, 0).getTime()
    to = endOfDayMs(addDays(from, 6))
  } else if (kind === 'month') {
    from = new Date(y, m, 1).getTime()
    to = endOfDayMs(noon(y, m, daysInMonth(y, m)))
  } else if (kind === 'quarter') {
    const qStart = Math.floor(m / 3) * 3
    from = new Date(y, qStart, 1).getTime()
    to = endOfDayMs(noon(y, qStart + 2, daysInMonth(y, qStart + 2)))
  } else if (kind === 'year') {
    from = new Date(y, 0, 1).getTime()
    to = endOfDayMs(noon(y, 11, 31))
  } else {
    throw new Error(`Unknown period kind: ${kind}`)
  }
  return { kind, from, to, ref: refMs }
}

/** Custom period from two day timestamps (order-insensitive), full-day bounds. */
export function customRange(fromTs, toTs) {
  const a = Math.min(fromTs, toTs)
  const b = Math.max(fromTs, toTs)
  return { kind: 'custom', from: startOfDayMs(a), to: endOfDayMs(b) }
}

/**
 * The period immediately before `range`. Named kinds shift by one calendar
 * unit; custom shifts back by its own length (back-to-back, same day count).
 */
export function previousPeriod(range) {
  if (range.kind === 'custom') {
    const DAY = 24 * 60 * 60 * 1000
    const days = Math.round((startOfDayMs(range.to) - startOfDayMs(range.from)) / DAY) + 1
    return customRange(addDays(range.from, -days), addDays(range.to, -days))
  }
  const d = new Date(range.ref ?? range.from)
  let prevRef
  if (range.kind === 'week') {
    prevRef = addDays(range.from, -1)
  } else if (range.kind === 'month') {
    prevRef = noon(d.getFullYear(), d.getMonth() - 1, 1)
  } else if (range.kind === 'quarter') {
    prevRef = noon(d.getFullYear(), d.getMonth() - 3, 1)
  } else {
    prevRef = noon(d.getFullYear() - 1, d.getMonth(), 1)
  }
  return periodRange(range.kind, prevRef)
}

/** Full-day range for a specific calendar month (month-index). */
export function monthRange(y, mIdx) {
  return {
    kind: 'month',
    from: new Date(y, mIdx, 1).getTime(),
    to: endOfDayMs(noon(y, mIdx, daysInMonth(y, mIdx))),
    ref: noon(y, mIdx, 1),
  }
}
