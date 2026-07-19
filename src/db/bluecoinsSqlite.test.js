import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import initSqlJs from 'sql.js'
import { isSqliteFile, parseBlueCoinsSqlite } from './bluecoinsSqlite'
import { noon, addDays, todayNoon } from '../lib/dates'

const M = 1_000_000

/** Build a minimal BlueCoins-shaped .fydb fixture and return its bytes. */
function buildFixture() {
  const path = join(mkdtempSync(join(tmpdir(), 'fydb-')), 'fixture.fydb')
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE ITEMTABLE (itemTableID INTEGER PRIMARY KEY, itemName TEXT);
    CREATE TABLE CHILDCATEGORYTABLE (categoryTableID INTEGER PRIMARY KEY, childCategoryName TEXT);
    CREATE TABLE ACCOUNTSTABLE (accountsTableID INTEGER PRIMARY KEY, accountName TEXT, accountTypeID INTEGER);
    CREATE TABLE ACCOUNTTYPETABLE (accountTypeTableID INTEGER PRIMARY KEY, accountTypeName TEXT, accountingGroupID INTEGER);
    CREATE TABLE TRANSACTIONSTABLE (
      transactionsTableID INTEGER PRIMARY KEY, itemID INTEGER, amount INTEGER, date TEXT,
      transactionTypeID INTEGER, categoryID INTEGER, accountID INTEGER, accountPairID INTEGER,
      notes TEXT, deletedTransaction INTEGER
    );
  `)
  const run = (sql) => db.exec(sql)
  // 3=Bank(Assets), 4=liability, 5=Investments(Assets)
  run(`INSERT INTO ACCOUNTTYPETABLE VALUES (3, 'Bank', 1), (4, 'Other Liabilities', 2), (5, 'Investments', 1)`)
  run(`INSERT INTO ACCOUNTSTABLE VALUES (-1, '(No Account)', 0), (1, 'Giro', 3), (2, 'Depot', 5), (3, 'Loan', 4)`)
  run(`INSERT INTO ITEMTABLE VALUES (1, 'Döner'), (2, 'Investment Jul'), (3, '(System Generated Account)'), (4, 'Salary')`)
  run(`INSERT INTO CHILDCATEGORYTABLE VALUES (10, 'Eating Out'), (11, 'Salary')`)

  const rows = [
    // Opening balances (type 2): Giro 650 €, Loan owes 2000 €.
    `(1, 3, ${650 * M}, '2026-01-01 12:00:00', 2, 2, 1, NULL, '', 6)`,
    `(2, 3, ${-2000 * M}, '2026-01-01 12:00:00', 2, 2, 3, NULL, '', 6)`,
    // Live expense (amounts are negative micros in BlueCoins).
    `(100, 1, ${-8 * M}, '2026-07-01 10:12:00', 3, 10, 1, NULL, '', 6)`,
    // Deleted expense — must be skipped.
    `(101, 1, ${-99 * M}, '2026-07-01 11:00:00', 3, 10, 1, NULL, '', 5)`,
    // Income.
    `(102, 4, ${3000 * M}, '2026-07-02 08:00:00', 4, 11, 1, NULL, '', 6)`,
    // Transfer pair Giro -> Depot (negative row carries the pair id).
    `(110, 2, ${-1500 * M}, '2026-07-03 09:00:00', 5, 3, 1, 2, '', 6)`,
    `(111, 2, ${1500 * M}, '2026-07-03 09:00:00', 5, 3, 2, 1, '', 6)`,
    // Pre-generated FUTURE reminder occurrence — must be skipped.
    `(120, 1, ${-50 * M}, '2099-01-15 00:00:00', 3, 10, 1, NULL, '', 6)`,
    // Zero amount — skipped.
    `(121, 1, 0, '2026-07-04 00:00:00', 3, 10, 1, NULL, '', 6)`,
  ]
  run(`INSERT INTO TRANSACTIONSTABLE VALUES ${rows.join(',')}`)
  db.close()
  return new Uint8Array(readFileSync(path))
}

let SQL
let bytes

beforeAll(async () => {
  SQL = await initSqlJs({
    locateFile: (f) => join(process.cwd(), 'node_modules', 'sql.js', 'dist', f),
  })
  bytes = buildFixture()
})

describe('isSqliteFile', () => {
  it('detects the SQLite magic header', () => {
    expect(isSqliteFile(bytes)).toBe(true)
    expect(isSqliteFile(new TextEncoder().encode('Date,Amount\n1,2'))).toBe(false)
  })
})

describe('parseBlueCoinsSqlite', () => {
  it('extracts transactions, pairs transfers, converts micros', () => {
    const { parsed } = parseBlueCoinsSqlite(SQL, bytes)
    expect(parsed).toHaveLength(3)

    const expense = parsed.find((t) => t.type === 'expense')
    expect(expense).toMatchObject({
      amount: 8,
      description: 'Döner',
      category: 'Eating Out',
      account: 'Giro',
      date: noon(2026, 6, 1),
    })

    const income = parsed.find((t) => t.type === 'income')
    expect(income).toMatchObject({ amount: 3000, category: 'Salary', account: 'Giro' })

    const transfer = parsed.find((t) => t.type === 'transfer')
    expect(transfer).toMatchObject({
      amount: 1500,
      fromAccount: 'Giro',
      toAccount: 'Depot',
      description: 'Investment Jul',
    })
  })

  it('skips deleted, future and zero rows with reasons', () => {
    const { skipped } = parseBlueCoinsSqlite(SQL, bytes)
    const reasons = skipped.map((s) => s.reason).sort()
    expect(reasons).toEqual(['Deleted in BlueCoins', 'Future scheduled occurrence', 'Zero amount'])
  })

  it('builds account defs with types and opening balances', () => {
    const { accountDefs } = parseBlueCoinsSqlite(SQL, bytes)
    expect(accountDefs.get('giro')).toEqual({ name: 'Giro', type: 'asset', usage: 'active', startingBalance: 650 })
    expect(accountDefs.get('loan')).toEqual({ name: 'Loan', type: 'liability', usage: 'active', startingBalance: 2000 })
    // "Investments" account type maps to usage 'investment'.
    expect(accountDefs.get('depot')).toEqual({ name: 'Depot', type: 'asset', usage: 'investment', startingBalance: 0 })
    expect(accountDefs.has('(no account)')).toBe(false)
  })

  it('future cutoff is inclusive of today', () => {
    // A row dated today must NOT be skipped as future.
    const today = new Date(todayNoon())
    const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} 09:00:00`
    const path = join(mkdtempSync(join(tmpdir(), 'fydb2-')), 'f.fydb')
    const db2 = new DatabaseSync(path)
    db2.exec(`
      CREATE TABLE ITEMTABLE (itemTableID INTEGER PRIMARY KEY, itemName TEXT);
      CREATE TABLE CHILDCATEGORYTABLE (categoryTableID INTEGER PRIMARY KEY, childCategoryName TEXT);
      CREATE TABLE ACCOUNTSTABLE (accountsTableID INTEGER PRIMARY KEY, accountName TEXT, accountTypeID INTEGER);
      CREATE TABLE ACCOUNTTYPETABLE (accountTypeTableID INTEGER PRIMARY KEY, accountTypeName TEXT, accountingGroupID INTEGER);
      CREATE TABLE TRANSACTIONSTABLE (transactionsTableID INTEGER PRIMARY KEY, itemID INTEGER, amount INTEGER, date TEXT, transactionTypeID INTEGER, categoryID INTEGER, accountID INTEGER, accountPairID INTEGER, notes TEXT, deletedTransaction INTEGER);
      INSERT INTO ACCOUNTTYPETABLE VALUES (3, 'Bank', 1);
      INSERT INTO ACCOUNTSTABLE VALUES (1, 'Giro', 3);
      INSERT INTO TRANSACTIONSTABLE VALUES (1, NULL, ${-5 * M}, '${stamp}', 3, NULL, 1, NULL, 'today row', 6);
      INSERT INTO TRANSACTIONSTABLE VALUES (2, NULL, ${-5 * M}, '${new Date(addDays(todayNoon(), 1)).toISOString().slice(0, 10)} 09:00:00', 3, NULL, 1, NULL, 'tomorrow row', 6);
    `)
    db2.close()
    const { parsed, skipped } = parseBlueCoinsSqlite(SQL, new Uint8Array(readFileSync(path)))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].description).toBe('today row')
    expect(skipped[0].reason).toBe('Future scheduled occurrence')
  })
})
