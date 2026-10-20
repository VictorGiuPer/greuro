import { describe, expect, it } from 'vitest'
import { createTransactionFilters, transactionDateLabel } from './transactionFilters'
import { monthRange, noon } from './dates'

describe('transaction filters', () => {
  it('starts with all dates, accounts and categories and no shared mutable lists', () => {
    const first = createTransactionFilters()
    first.accountIds.push(1)
    first.categoryIds.push(2)
    first.dateTo = noon(2026, 5, 30)
    expect(createTransactionFilters()).toEqual({
      types: [], accountIds: [], categoryIds: [], tripIds: [], owedOnly: false,
      dateFrom: null, dateTo: null,
    })
  })

  it('identifies full calendar months and one-sided ranges clearly', () => {
    const range = monthRange(2026, 5)
    expect(transactionDateLabel({ dateFrom: range.from, dateTo: range.to })).toBe('Month: June 2026')
    expect(transactionDateLabel({ dateFrom: range.from, dateTo: null })).toMatch(/^From: /)
    expect(transactionDateLabel({ dateFrom: null, dateTo: range.to })).toMatch(/^Until: /)
    expect(transactionDateLabel({ dateFrom: noon(2026, 5, 2), dateTo: range.to })).toMatch(/^Dates: /)
  })
})
