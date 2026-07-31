import { describe, it, expect } from 'vitest'
import { extractAmount, parsePrefillFromSearch } from './prefill'

describe('extractAmount', () => {
  it('pulls the amount from typical payment-notification text', () => {
    expect(extractAmount('You paid €12.50 to Bakery')).toBe(12.5)
    expect(extractAmount('Bezahlt 12,50 € an Edeka')).toBe(12.5)
    expect(extractAmount('$1,234.56 charged')).toBe(1234.56)
    expect(extractAmount('1.234,56 € gezahlt')).toBe(1234.56)
  })

  it('prefers the number next to a currency symbol', () => {
    // "3" (a count) appears before the real amount.
    expect(extractAmount('3 items · total €48,90')).toBe(48.9)
  })

  it('falls back to the first decimal number without a symbol', () => {
    expect(extractAmount('Payment of 9,99 confirmed')).toBe(9.99)
  })

  it('returns null when there is no amount', () => {
    expect(extractAmount('Your order shipped')).toBeNull()
    expect(extractAmount('')).toBeNull()
  })
})

describe('parsePrefillFromSearch', () => {
  it('reads a direct ?amount= param (Tasker URL)', () => {
    expect(parsePrefillFromSearch('?amount=12,50')).toEqual({ amount: 12.5 })
    expect(parsePrefillFromSearch('?amount=1234.56')).toEqual({ amount: 1234.56 })
  })

  it('reads shared text/title (Web Share Target)', () => {
    expect(parsePrefillFromSearch('?text=You%20paid%20%E2%82%AC7%2C80')).toEqual({ amount: 7.8 })
    expect(parsePrefillFromSearch('?title=Receipt&text=Total%20%E2%82%AC42%2C00')).toEqual({
      amount: 42,
    })
  })

  it('returns null with no usable params', () => {
    expect(parsePrefillFromSearch('')).toBeNull()
    expect(parsePrefillFromSearch('?foo=bar')).toBeNull()
    expect(parsePrefillFromSearch('?amount=abc')).toBeNull()
  })
})
