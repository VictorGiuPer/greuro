import { describe, it, expect } from 'vitest'
import {
  noon,
  periodRange,
  previousPeriod,
  customRange,
  addMonthsClamped,
  monthRange,
  addDays,
  daysUntil,
  startOfDayMs,
} from './dates'

const day = (ts) => new Date(ts)

describe('periodRange', () => {
  it('week starts on Monday (German convention)', () => {
    // 2026-07-06 is a Monday.
    const r = periodRange('week', noon(2026, 6, 8)) // Wed Jul 8 2026
    expect(day(r.from).getDay()).toBe(1) // Monday
    expect(day(r.from).getDate()).toBe(6)
    expect(day(r.to).getDay()).toBe(0) // Sunday
    expect(day(r.to).getDate()).toBe(12)
  })
  it('month covers first to last day', () => {
    const r = periodRange('month', noon(2026, 1, 15)) // Feb 2026
    expect(day(r.from).getDate()).toBe(1)
    expect(day(r.to).getDate()).toBe(28)
  })
  it('quarter and year bounds', () => {
    const q = periodRange('quarter', noon(2026, 4, 10)) // May -> Q2
    expect(day(q.from).getMonth()).toBe(3) // April
    expect(day(q.to).getMonth()).toBe(5) // June
    const y = periodRange('year', noon(2026, 4, 10))
    expect(day(y.from).getMonth()).toBe(0)
    expect(day(y.to).getMonth()).toBe(11)
  })
  it('noon transactions on boundary days fall inside', () => {
    const r = periodRange('month', noon(2026, 6, 15))
    expect(noon(2026, 6, 1)).toBeGreaterThanOrEqual(r.from)
    expect(noon(2026, 6, 31)).toBeLessThanOrEqual(r.to)
  })
})

describe('previousPeriod', () => {
  it('previous month across year boundary', () => {
    const r = previousPeriod(periodRange('month', noon(2026, 0, 15)))
    expect(day(r.from).getFullYear()).toBe(2025)
    expect(day(r.from).getMonth()).toBe(11)
  })
  it('custom shifts back by its own length', () => {
    const r = customRange(noon(2026, 6, 1), noon(2026, 6, 10)) // 10 days
    const p = previousPeriod(r)
    expect(day(p.from).getDate()).toBe(21) // Jun 21
    expect(day(p.to).getDate()).toBe(30) // Jun 30
  })
})

describe('addMonthsClamped', () => {
  it('clamps Jan 31 -> Feb 28 and recovers to Mar 31 via anchor', () => {
    const jan31 = noon(2026, 0, 31)
    const feb = addMonthsClamped(jan31, 1, 31)
    expect(day(feb).getMonth()).toBe(1)
    expect(day(feb).getDate()).toBe(28)
    const mar = addMonthsClamped(feb, 1, 31)
    expect(day(mar).getMonth()).toBe(2)
    expect(day(mar).getDate()).toBe(31)
  })
  it('handles year rollover', () => {
    const nov = noon(2026, 10, 15)
    const jan = addMonthsClamped(nov, 2, 15)
    expect(day(jan).getFullYear()).toBe(2027)
    expect(day(jan).getMonth()).toBe(0)
  })
})

describe('misc', () => {
  it('monthRange matches periodRange month', () => {
    const a = monthRange(2026, 6)
    const b = periodRange('month', noon(2026, 6, 20))
    expect(a.from).toBe(b.from)
    expect(a.to).toBe(b.to)
  })
  it('addDays preserves noon across a month boundary', () => {
    const t = addDays(noon(2026, 6, 31), 1)
    expect(day(t).getMonth()).toBe(7)
    expect(day(t).getHours()).toBe(12)
  })
  it('daysUntil counts whole local days', () => {
    const today = startOfDayMs(Date.now())
    expect(daysUntil(addDays(today, 3))).toBe(3)
    expect(daysUntil(addDays(today, -2))).toBe(-2)
  })
})
