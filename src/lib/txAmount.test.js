import { describe, it, expect } from 'vitest'
import { effectiveAmount, outstandingAmount, isResolved } from './txAmount'

const expense = (over = {}) => ({ type: 'expense', amount: 100, ...over })

describe('effectiveAmount', () => {
  it('is the plain amount when the tag is off', () => {
    expect(effectiveAmount(expense())).toBe(100)
    expect(effectiveAmount(expense({ owedAmount: 60 }))).toBe(100) // not flagged
  })

  it('counts as the full amount while pending, even with an owed figure set', () => {
    expect(effectiveAmount(expense({ reimbursable: 1, owedAmount: 60 }))).toBe(100)
  })

  it('nets off the owed amount once resolved', () => {
    expect(effectiveAmount(expense({ reimbursable: 1, owedAmount: 60, resolved: 1 }))).toBe(40)
  })

  it('never goes below zero when the owed amount exceeds the total', () => {
    expect(effectiveAmount(expense({ reimbursable: 1, owedAmount: 150, resolved: 1 }))).toBe(0)
  })

  it('ignores the tag on income and transfers', () => {
    expect(
      effectiveAmount({ type: 'income', amount: 100, reimbursable: 1, owedAmount: 60, resolved: 1 })
    ).toBe(100)
    expect(
      effectiveAmount({ type: 'transfer', amount: 100, reimbursable: 1, owedAmount: 60, resolved: 1 })
    ).toBe(100)
  })

  it('handles missing/garbage values', () => {
    expect(effectiveAmount(undefined)).toBe(0)
    expect(effectiveAmount(expense({ reimbursable: 1, resolved: 1 }))).toBe(100) // no owedAmount
  })
})

describe('outstandingAmount', () => {
  it('is the owed figure while pending', () => {
    expect(outstandingAmount(expense({ reimbursable: 1, owedAmount: 40 }))).toBe(40)
  })

  it('is zero once resolved, regardless of the owed figure', () => {
    expect(outstandingAmount(expense({ reimbursable: 1, owedAmount: 40, resolved: 1 }))).toBe(0)
  })

  it('is zero for untagged rows and other types', () => {
    expect(outstandingAmount(expense())).toBe(0)
    expect(outstandingAmount({ type: 'income', amount: 50, reimbursable: 1, owedAmount: 20 })).toBe(0)
  })
})

describe('isResolved', () => {
  it('is false while not explicitly marked resolved, no matter the owed amount', () => {
    expect(isResolved(expense({ reimbursable: 1, owedAmount: 0 }))).toBe(false)
    expect(isResolved(expense({ reimbursable: 1, owedAmount: 60 }))).toBe(false)
  })

  it('is true once the Resolved flag is set', () => {
    expect(isResolved(expense({ reimbursable: 1, owedAmount: 60, resolved: 1 }))).toBe(true)
  })

  it('is false for untagged expenses and other transaction types', () => {
    expect(isResolved(expense())).toBe(false)
    expect(isResolved({ type: 'income', amount: 100, reimbursable: 1, resolved: 1 })).toBe(false)
  })
})
