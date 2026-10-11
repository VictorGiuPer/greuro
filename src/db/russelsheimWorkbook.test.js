import { beforeEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { db } from './db'
import { accountBalances } from './derive'
import {
  RUSSELSHEIM_ACCOUNT_NAME,
  commitRusselsheimImport,
  detectRusselsheimWorkbook,
  parseRusselsheimWorkbook,
  planRusselsheimImport,
} from './russelsheimWorkbook'
import { noon } from '../lib/dates'

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

function addFormulaTotals(ws, cells) {
  for (const address of cells) ws[address] = { t: 'n', f: 'SUM(A1:A1)', v: 0 }
}

function appendSheet(workbook, name, rows, merges, formulaCells) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!merges'] = merges.map((range) => XLSX.utils.decode_range(range))
  addFormulaTotals(ws, formulaCells)
  XLSX.utils.book_append_sheet(workbook, ws, name)
}

function octoberWorkbook() {
  const workbook = XLSX.utils.book_new()
  appendSheet(
    workbook,
    'Tabelle1',
    [
      ['Oktober', null, null, null, 'Januar', null, null, null, null],
      ['Miete', 'Einkaufen', 'Rest', 'Wofür?', 'Miete', 'Einkaufen', 'Mensa', 'Rest', 'Wofür?'],
      [500, 15, 6, 'Snack', 500, '4,50 €', 2.5, 9, 'Kino'],
      [null, 0, 4, 'Taxi', null, null, 0, 0, ''],
      [null, null, null, null, null, null, null, null, null],
    ],
    ['A1:D1', 'E1:I1'],
    ['A5', 'E5'],
  )
  return workbook
}

function septemberWorkbook() {
  const workbook = XLSX.utils.book_new()
  appendSheet(
    workbook,
    'Tabelle2',
    [
      ['September', null, null, null, 'Oktober', null, null, null, null],
      ['Miete', 'Einkaufen', 'Rest', 'Wofür', 'Miete', 'Einkaufen', 'Mensa', 'Rest', 'Wofür'],
      [460, 20, 12, 'Bäcker', 460, 10, 2.2, 8, 'Kino'],
      [null, null, null, null, null, null, null, null, null],
    ],
    ['A1:D1', 'E1:I1'],
    ['A4', 'E4'],
  )
  return workbook
}

describe('Rüsselsheim workbook layout parser', () => {
  it('detects an October-start sheet with a shifted Mensa layout and rolls into the next year', () => {
    const workbook = octoberWorkbook()
    const layouts = detectRusselsheimWorkbook(XLSX, workbook, 2026)
    const { parsed, skipped, totalAmount } = parseRusselsheimWorkbook(
      XLSX,
      workbook,
      layouts,
      { Tabelle1: 2023 },
    )

    expect(parsed).toHaveLength(8)
    expect(skipped).toEqual([])
    expect(totalAmount).toBeCloseTo(1041)
    expect(parsed.find((row) => row.description === 'Snack')).toMatchObject({
      category: 'Rest',
      amount: 6,
      date: noon(2023, 9, 1),
    })
    expect(parsed.find((row) => row.description === 'Kino')).toMatchObject({
      category: 'Rest',
      amount: 9,
      date: noon(2024, 0, 1),
    })
    expect(parsed.find((row) => row.category === 'Mensa')).toMatchObject({
      description: 'Mensa',
      amount: 2.5,
      date: noon(2024, 0, 1),
    })
    expect(parsed.every((row) => row.sourceKey.includes(':0:'))).toBe(true)
  })

  it('supports September-start sheets and Wofür without a question mark', () => {
    const workbook = septemberWorkbook()
    const layouts = detectRusselsheimWorkbook(XLSX, workbook, 2026)
    const { parsed } = parseRusselsheimWorkbook(XLSX, workbook, layouts, { Tabelle2: 2024 })

    expect(parsed).toHaveLength(7)
    expect(parsed.find((row) => row.description === 'Bäcker')).toMatchObject({
      date: noon(2024, 8, 1),
      category: 'Rest',
    })
    expect(parsed.find((row) => row.description === 'Kino')).toMatchObject({
      date: noon(2024, 9, 1),
      category: 'Rest',
    })
  })

  it('rejects sheets without the supported monthly structure', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Date', 'Amount'], ['2026-01-01', 10]]), 'Data')
    expect(() => detectRusselsheimWorkbook(XLSX, workbook, 2026)).toThrow('No supported monthly budget sheet')
  })
})

describe('Rüsselsheim workbook commit', () => {
  it('creates a neutral history account and skips the same source cells on re-import', async () => {
    const workbook = octoberWorkbook()
    const layouts = detectRusselsheimWorkbook(XLSX, workbook, 2026)
    const { parsed, totalAmount } = parseRusselsheimWorkbook(
      XLSX,
      workbook,
      layouts,
      { Tabelle1: 2023 },
    )

    const preview = await planRusselsheimImport(parsed)
    expect(preview).toMatchObject({ duplicates: 0, accountExists: false })
    expect(preview.newCategories.sort()).toEqual(['Einkaufen', 'Mensa', 'Miete', 'Rest'])

    const first = await commitRusselsheimImport(parsed)
    expect(first).toMatchObject({ imported: 8, duplicates: 0, categoriesCreated: 4, accountCreated: true })
    const account = await db.accounts.where('name').equals(RUSSELSHEIM_ACCOUNT_NAME).first()
    expect(account.startingBalance).toBeCloseTo(totalAmount)
    expect(await db.transactions.count()).toBe(8)
    await expect(accountBalances().then((balances) => balances.get(account.id))).resolves.toBeCloseTo(0)

    const secondPreview = await planRusselsheimImport(parsed)
    expect(secondPreview.ready).toHaveLength(0)
    expect(secondPreview.duplicates).toBe(8)
    expect(await commitRusselsheimImport(parsed)).toMatchObject({ imported: 0, duplicates: 8 })
    expect(await db.transactions.count()).toBe(8)
  })
})
