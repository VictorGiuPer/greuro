import { describe, it, expect } from 'vitest'
import { evaluate, isExpression } from './calc'

describe('evaluate', () => {
  it('sums German comma decimals: "12,50 + 3,20 - 1" = 14.70', () => {
    expect(evaluate('12,50 + 3,20 - 1')).toEqual({ value: 14.7, error: null, incomplete: false })
  })
  it('plain number', () => {
    expect(evaluate('42').value).toBe(42)
    expect(evaluate('12,5').value).toBe(12.5)
  })
  it('thousands dots inside comma numbers', () => {
    expect(evaluate('1.234,56 + 0,44').value).toBe(1235)
  })
  it('unicode operators × ÷ −', () => {
    expect(evaluate('2 × 3').value).toBe(6)
    expect(evaluate('10 ÷ 4').value).toBe(2.5)
    expect(evaluate('5 − 2').value).toBe(3)
  })
  it('precedence: 2+3*4 = 14', () => {
    expect(evaluate('2+3*4').value).toBe(14)
  })
  it('unary minus', () => {
    expect(evaluate('-5 + 10').value).toBe(5)
  })
  it('rounds to cents', () => {
    expect(evaluate('10 ÷ 3').value).toBe(3.33)
  })
  it('trailing operator is incomplete, not an error', () => {
    expect(evaluate('12,50 +')).toEqual({ value: null, error: null, incomplete: true })
    expect(evaluate('')).toMatchObject({ incomplete: true })
  })
  it('invalid input errors', () => {
    expect(evaluate('abc').error).toBeTruthy()
    expect(evaluate('1,2,3').error).toBeTruthy()
    expect(evaluate('4 5').error).toBeTruthy()
  })
  it('division by zero errors', () => {
    expect(evaluate('1 ÷ 0').error).toBeTruthy()
  })
})

describe('isExpression', () => {
  it('detects operators beyond a leading minus', () => {
    expect(isExpression('12,50')).toBe(false)
    expect(isExpression('-12,50')).toBe(false)
    expect(isExpression('12,50+3')).toBe(true)
    expect(isExpression('2×3')).toBe(true)
  })
})
