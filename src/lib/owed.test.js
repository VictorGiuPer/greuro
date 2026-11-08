import { describe, expect, it } from 'vitest'
import { evaluateOwed, groupOwedTransactions } from './owed'

describe('owed calculations', () => {
  it('evaluates inline arithmetic and shares of the current total', () => {
    expect(evaluateOwed('20%', 100).value).toBe(20)
    expect(evaluateOwed('20%', 200).value).toBe(40)
    expect(evaluateOwed('12,5% + 5', 100).value).toBe(17.5)
    expect(evaluateOwed('10% + 20%', 90).value).toBe(27)
    expect(evaluateOwed('100 / 3', 100).value).toBe(33.33)
    expect(evaluateOwed('33,33%', 19.99).value).toBe(6.66)
    expect(evaluateOwed('1.000,50 * 2', 3000).value).toBe(2001)
  })

  it('rejects invalid expressions and handles unfinished typing', () => {
    for (const input of ['20%%', '20% / 0', 'abc', '1,2,3%']) expect(evaluateOwed(input, 100).error).toBeTruthy()
    expect(evaluateOwed('20%', 0).error).toBeTruthy()
    expect(evaluateOwed('20% +', 100).incomplete).toBe(true)
    expect(evaluateOwed('', 100).incomplete).toBe(true)
  })
})

describe('owed grouping', () => {
  it('groups names without rewriting records and keeps full lifetime history', () => {
    const rows = [
      { id: 1, date: 1, type: 'expense', reimbursable: 1, paidBackNote: ' Nadine ', owedAmount: 0.1 },
      { id: 2, date: 2, type: 'expense', reimbursable: 1, paidBackNote: 'nadine', owedAmount: 0.2 },
      { id: 3, date: 3, type: 'expense', reimbursable: 1, paidBackNote: 'Nadine', owedAmount: 10, resolved: 1 },
      { id: 4, date: 4, type: 'expense', reimbursable: 1, paidBackNote: 'Nadine dinner', owedAmount: 5 },
      { id: 5, date: 5, type: 'expense', reimbursable: 1, owedAmount: 3 },
      { id: 6, date: 6, type: 'income', reimbursable: 1, paidBackNote: 'Nadine', owedAmount: 20 },
      { id: 7, date: 7, type: 'expense', owedAmount: 20 },
    ]
    const before = structuredClone(rows)
    const groups = groupOwedTransactions(rows)
    expect(groups).toHaveLength(3)
    expect(groups.find((g) => g.key === 'nadine')).toMatchObject({ name: 'Nadine', total: 10.3, outstanding: 0.3, resolved: 10 })
    expect(groups.find((g) => g.key === 'nadine').transactions.map((t) => t.id)).toEqual([3, 2, 1])
    expect(groups.find((g) => g.key === '').name).toBe('Unspecified')
    expect(rows).toEqual(before)
  })

  it('normalizes repeated whitespace and retains zero-amount history', () => {
    const groups = groupOwedTransactions([
      { id: 1, type: 'expense', reimbursable: 1, paidBackNote: 'Work   team', owedAmount: 0 },
      { id: 2, type: 'expense', reimbursable: 1, paidBackNote: 'work team', owedAmount: 10 },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].transactions).toHaveLength(2)
    expect(groups[0].outstanding).toBe(10)
  })
})
