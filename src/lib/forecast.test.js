import { describe, it, expect } from 'vitest'
import { projectBands, referencePoints, investmentTargetId } from './forecast'

const SETTINGS = {
  forecastBandSpread: 2,
  inflationRate: 2,
  inflationAdjust: false,
  monthlyInvestment: 0,
  investmentTargetAccountId: null,
}

function bands({ accounts, balances, years = 1, settings = SETTINGS }) {
  return projectBands({
    accounts,
    startBalances: new Map(balances),
    horizonYears: years,
    settings,
  })
}

const invest = { id: 1, type: 'asset', expectedAnnualReturn: 7 }
const cash = { id: 2, type: 'asset', expectedAnnualReturn: 0 }

describe('projectBands — per-account compounding', () => {
  it('compounds an account at its own annual return (expected/base line)', () => {
    const pts = bands({ accounts: [invest], balances: [[1, 10000]] })
    expect(pts).toHaveLength(13)
    expect(pts[0].base).toBe(10000)
    expect(pts[12].base).toBeCloseTo(10700, 0) // (1.07)^1
  })

  it('bands shift each rate by ± the spread (7% → 5/7/9), worst floored at 0', () => {
    const pts = bands({ accounts: [invest], balances: [[1, 10000]] })
    expect(pts[12].pess).toBeCloseTo(10500, 0) // 7 − 2 = 5 %
    expect(pts[12].opt).toBeCloseTo(10900, 0) // 7 + 2 = 9 %
    expect(pts[12].range).toEqual([pts[12].pess, pts[12].opt])

    // A 1% account: worst floors at 0% (not −1%).
    const low = bands({ accounts: [{ id: 9, expectedAnnualReturn: 1 }], balances: [[9, 1000]] })
    expect(low[12].pess).toBe(1000)
  })

  it('a 0% account: base flat, worst floored at 0, best gets the +spread', () => {
    const pts = bands({ accounts: [cash], balances: [[2, 5000]] })
    expect(pts[12].base).toBe(5000) // 0 %
    expect(pts[12].pess).toBe(5000) // max(0, 0 − 2) = 0 %
    expect(pts[12].opt).toBeCloseTo(5100, 0) // 0 + 2 = 2 %
  })

  it('sums multiple investment accounts, each at its own rate', () => {
    const pts = bands({
      accounts: [invest, { id: 3, expectedAnnualReturn: 3 }],
      balances: [
        [1, 10000],
        [3, 5000],
      ],
    })
    expect(pts[12].base).toBeCloseTo(10700 + 5150, 0)
  })
})

describe('projectBands — monthly contribution (only lever, no scheduled)', () => {
  it('adds the monthly investment into the highest-return account by default', () => {
    const pts = bands({
      accounts: [invest, cash],
      balances: [
        [1, 0],
        [2, 0],
      ],
      settings: { ...SETTINGS, monthlyInvestment: 100 },
    })
    // 12×100 contributed into the 7% account + growth → >1200, <1300.
    expect(pts[12].base).toBeGreaterThan(1200)
    expect(pts[12].base).toBeLessThan(1300)
    expect(pts[12].opt).toBeGreaterThan(pts[12].pess)
  })

  it('respects an explicit target account', () => {
    const pts = bands({
      accounts: [invest, cash],
      balances: [
        [1, 0],
        [2, 0],
      ],
      settings: { ...SETTINGS, monthlyInvestment: 100, investmentTargetAccountId: 2 },
    })
    // Into the 0% account → exactly flat contributions, no growth.
    expect(pts[12].base).toBe(1200)
  })

  it('is NOT affected by scheduled items (the param no longer exists)', () => {
    // Passing scheduled is ignored; only monthlyInvestment counts.
    const pts = projectBands({
      accounts: [invest],
      startBalances: new Map([[1, 1000]]),
      horizonYears: 1,
      settings: { ...SETTINGS, monthlyInvestment: 0 },
      scheduled: [{ type: 'transfer', amount: 9999, toAccountId: 1, active: 1, recurrence: { unit: 'month', interval: 1 } }],
    })
    expect(pts[12].base).toBeCloseTo(1070, 0) // just 1000 @7%, no phantom 9999
  })
})

describe('projectBands — inflation + reference points', () => {
  it('inflation adjustment discounts future values', () => {
    const pts = bands({
      accounts: [cash],
      balances: [[2, 10200]],
      settings: { ...SETTINGS, inflationAdjust: true, inflationRate: 2 },
    })
    expect(pts[0].base).toBe(10200)
    expect(pts[12].base).toBeCloseTo(10000, 0) // 10200 / 1.02
  })

  it('referencePoints returns 5 evenly-spaced years per horizon', () => {
    const pts5 = bands({ accounts: [invest], balances: [[1, 10000]], years: 5 })
    expect(referencePoints(pts5, 5).map((r) => r.year)).toEqual([1, 2, 3, 4, 5])
    expect(referencePoints(pts5, 10).map((r) => r.year)).toEqual([2, 4, 6, 8, 10])
    expect(referencePoints(pts5, 20).map((r) => r.year)).toEqual([4, 8, 12, 16, 20])
    // Year-1 reference equals the month-12 base value.
    expect(referencePoints(pts5, 5)[0].value).toBeCloseTo(pts5[12].base, 6)
  })
})

describe('investmentTargetId', () => {
  it('picks the highest-return account', () => {
    expect(investmentTargetId([invest, cash])).toBe(1)
    expect(investmentTargetId([])).toBeNull()
  })
})
