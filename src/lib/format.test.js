import { describe, it, expect } from 'vitest'
import {
  formatAmount,
  signedAmount,
  parseAmountInput,
  toAmountInputValue,
  formatDate,
  dayKey,
  fromDateInputValue,
} from './format'

// Intl emits non-breaking / narrow spaces; normalize for readable assertions.
const norm = (s) => s.replace(/[  ]/g, ' ')

describe('formatAmount (German EUR)', () => {
  it('formats 1234.56 as "1.234,56 €"', () => {
    expect(norm(formatAmount(1234.56))).toBe('1.234,56 €')
  })
  it('always two decimals, absolute value', () => {
    expect(norm(formatAmount(-5))).toBe('5,00 €')
    expect(norm(formatAmount(0.5))).toBe('0,50 €')
  })
})

describe('signedAmount', () => {
  it('prefixes by type', () => {
    expect(norm(signedAmount('income', 1250))).toBe('+1.250,00 €')
    expect(norm(signedAmount('expense', 68.42))).toBe('-68,42 €')
    expect(norm(signedAmount('transfer', 500))).toBe('-500,00 €')
  })
})

describe('parseAmountInput', () => {
  it('parses comma decimals', () => {
    expect(parseAmountInput('12,5')).toBe(12.5)
    expect(parseAmountInput('1.234,56')).toBe(1234.56)
  })
  it('accepts a lone dot as decimal when no comma present', () => {
    expect(parseAmountInput('12.5')).toBe(12.5)
  })
  it('strips € and spaces', () => {
    expect(parseAmountInput(' 1.234,56 € ')).toBe(1234.56)
  })
  it('rejects garbage', () => {
    expect(parseAmountInput('abc')).toBeNaN()
    expect(parseAmountInput('1,2,3')).toBeNaN()
    expect(parseAmountInput('')).toBeNaN()
  })
})

describe('toAmountInputValue', () => {
  it('renders comma decimal without grouping', () => {
    expect(toAmountInputValue(14.7)).toBe('14,7')
    expect(toAmountInputValue(1234.56)).toBe('1234,56')
    expect(toAmountInputValue('')).toBe('')
  })
})

describe('dates', () => {
  it('formatDate is DD.MM.YYYY', () => {
    expect(formatDate(fromDateInputValue('2026-07-06'))).toBe('06.07.2026')
  })
  it('input round-trip lands on the same local day (noon anchor)', () => {
    const ts = fromDateInputValue('2025-05-20')
    expect(new Date(ts).getHours()).toBe(12)
    expect(dayKey(ts)).toBe('2025-05-20')
  })
})
