import { describe, it, expect } from 'vitest'
import { projectBands, monthlyEquivalent } from './forecast'

const SETTINGS = {
  returnPess: 5,
  returnBase: 7,
  returnOpt: 9,
  inflationRate: 2,
  inflationAdjust: false,
}

function bands({ accounts, balances, scheduled = [], years = 1, settings = SETTINGS }) {
  return projectBands({
    accounts,
    startBalances: new Map(balances),
    scheduled,
    horizonYears: years,
    settings,
  })
}

describe('monthlyEquivalent', () => {
  it('normalizes recurrences to per-month amounts', () => {
    expect(monthlyEquivalent({ amount: 100, recurrence: { unit: 'month', interval: 1 } })).toBe(100)
    expect(monthlyEquivalent({ amount: 1200, recurrence: { unit: 'year', interval: 1 } })).toBe(100)
    expect(
      monthlyEquivalent({ amount: 10, recurrence: { unit: 'week', interval: 1 } }),
    ).toBeCloseTo(43.48, 1)
    expect(
      monthlyEquivalent({ amount: 5, recurrence: { unit: 'day', interval: 1 } }),
    ).toBeCloseTo(152.19, 1)
  })
})

describe('projectBands', () => {
  const invest = { id: 1, type: 'asset', expectedAnnualReturn: 7 }
  const cash = { id: 2, type: 'asset', expectedAnnualReturn: 0 }

  it('compounds an account by its own annual return (base band)', () => {
    const pts = bands({ accounts: [invest], balances: [[1, 10000]] })
    expect(pts).toHaveLength(13)
    expect(pts[0].base).toBe(10000)
    expect(pts[12].base).toBeCloseTo(10700, 0) // (1.07)^(12/12)
  })

  it('cash stays flat in every band', () => {
    const pts = bands({ accounts: [cash], balances: [[2, 5000]] })
    expect(pts[12].base).toBe(5000)
    expect(pts[12].pess).toBe(5000)
    expect(pts[12].opt).toBe(5000)
  })

  it('bands scale the account rate by the settings ratios', () => {
    const pts = bands({ accounts: [invest], balances: [[1, 10000]] })
    expect(pts[12].pess).toBeCloseTo(10500, 0) // 7% × 5/7 = 5%
    expect(pts[12].opt).toBeCloseTo(10900, 0) // 7% × 9/7 = 9%
    expect(pts[12].range).toEqual([pts[12].pess, pts[12].opt])
  })

  it('transfers move money without changing net worth at 0 % returns', () => {
    const pts = bands({
      accounts: [{ ...invest, expectedAnnualReturn: 0 }, cash],
      balances: [
        [1, 0],
        [2, 6000],
      ],
      scheduled: [
        {
          type: 'transfer',
          amount: 100,
          fromAccountId: 2,
          toAccountId: 1,
          active: 1,
          recurrence: { unit: 'month', interval: 1 },
        },
      ],
    })
    expect(pts[12].base).toBeCloseTo(6000, 6)
  })

  it('recurring contributions into a returning account outgrow flat cash', () => {
    const flat = bands({ accounts: [cash], balances: [[2, 6000]] })
    const contributing = bands({
      accounts: [invest, cash],
      balances: [
        [1, 0],
        [2, 6000],
      ],
      scheduled: [
        {
          type: 'transfer',
          amount: 100,
          fromAccountId: 2,
          toAccountId: 1,
          active: 1,
          recurrence: { unit: 'month', interval: 1 },
        },
      ],
    })
    expect(contributing[12].base).toBeGreaterThan(flat[12].base)
  })

  it('scheduled income raises and expenses lower the projection', () => {
    const pts = bands({
      accounts: [cash],
      balances: [[2, 1000]],
      scheduled: [
        { type: 'income', amount: 200, accountId: 2, active: 1, recurrence: { unit: 'month', interval: 1 } },
        { type: 'expense', amount: 50, accountId: 2, active: 1, recurrence: { unit: 'month', interval: 1 } },
      ],
    })
    expect(pts[12].base).toBeCloseTo(1000 + 12 * 150, 6)
  })

  it('ignores inactive scheduled items', () => {
    const pts = bands({
      accounts: [cash],
      balances: [[2, 1000]],
      scheduled: [
        { type: 'income', amount: 200, accountId: 2, active: 0, recurrence: { unit: 'month', interval: 1 } },
      ],
    })
    expect(pts[12].base).toBe(1000)
  })

  it('inflation adjustment discounts future values', () => {
    const pts = bands({
      accounts: [cash],
      balances: [[2, 10200]],
      settings: { ...SETTINGS, inflationAdjust: true, inflationRate: 2 },
    })
    expect(pts[0].base).toBe(10200) // today unaffected
    expect(pts[12].base).toBeCloseTo(10000, 0) // 10200 / 1.02
  })

  it('monthly investment flows into the highest-return account and compounds', () => {
    const withInvest = bands({
      accounts: [invest, cash],
      balances: [
        [1, 0],
        [2, 0],
      ],
      settings: { ...SETTINGS, monthlyInvestment: 100 },
    })
    // 12 × 100 contributed, plus growth in the 7% account → more than 1200.
    expect(withInvest[12].base).toBeGreaterThan(1200)
    expect(withInvest[12].base).toBeLessThan(1300)
    // Bands diverge because contributions land in the return-bearing account.
    expect(withInvest[12].opt).toBeGreaterThan(withInvest[12].pess)
  })

  it('monthly investment into a 0% account adds flat (no returns anywhere)', () => {
    const pts = bands({
      accounts: [cash],
      balances: [[2, 500]],
      settings: { ...SETTINGS, monthlyInvestment: 50 },
    })
    expect(pts[12].base).toBe(500 + 12 * 50)
  })

  it('liabilities (negative balances) stay negative and compound', () => {
    const loan = { id: 3, type: 'liability', expectedAnnualReturn: 0 }
    const pts = bands({
      accounts: [cash, loan],
      balances: [
        [2, 5000],
        [3, -2000],
      ],
    })
    expect(pts[12].base).toBe(3000)
  })
})
