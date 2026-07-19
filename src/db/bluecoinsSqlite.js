import { noon, todayNoon } from '../lib/dates'

/**
 * BlueCoins .fydb parser — the native BlueCoins backup is a SQLite database
 * (read in-browser with sql.js; nothing leaves the device).
 *
 * Schema facts (verified against a real 2026 export):
 *   - TRANSACTIONSTABLE.amount is in MICROS (÷ 1.000.000).
 *   - transactionTypeID: 2 = "New Account" (opening balance),
 *     3 = Expense (negative amounts), 4 = Income (positive), 5 = Transfer
 *     (a ± pair; the NEGATIVE row's accountPairID is the destination).
 *   - deletedTransaction = 5 marks deleted rows (6 = live).
 *   - Reminder occurrences are pre-generated as FUTURE-dated rows — anything
 *     dated after today is skipped (it hasn't happened yet).
 *   - ITEMTABLE holds descriptions; CHILDCATEGORYTABLE→PARENTCATEGORYTABLE→
 *     CATEGORYGROUPTABLE resolves category names; ACCOUNTTYPETABLE's
 *     accountingGroupID: 1 = Assets, 2 = Liabilities.
 *
 * Output matches parseBlueCoinsRows() (bluecoins.js) so the preview/commit
 * pipeline is shared, plus `accountDefs` so accounts are created with their
 * real type and opening balance.
 */

const MICRO = 1_000_000

/** True when the file bytes are a SQLite database (BlueCoins .fydb). */
export function isSqliteFile(bytes) {
  const magic = 'SQLite format 3'
  if (bytes.length < magic.length) return false
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic.charCodeAt(i)) return false
  }
  return true
}

/** db.exec result -> array of plain row objects. */
function rows(db, sql) {
  const res = db.exec(sql)
  if (!res.length) return []
  const { columns, values } = res[0]
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])))
}

/** "2025-10-03 16:01:59" -> local noon of that calendar day. */
function parseSqliteDate(s) {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return noon(+m[1], +m[2] - 1, +m[3])
}

const PLACEHOLDER_NAMES = new Set([
  '(system generated account)',
  'unnamed expense',
  'unnamed income',
  'transfer',
])

/**
 * @param SQL    initialized sql.js module
 * @param bytes  Uint8Array of the .fydb file
 * @returns {{ parsed, skipped, accountDefs: Map<lowername,{name,type,startingBalance}> }}
 */
export function parseBlueCoinsSqlite(SQL, bytes) {
  const db = new SQL.Database(bytes)
  try {
    // ---- lookup tables ----
    const items = new Map(rows(db, 'SELECT itemTableID, itemName FROM ITEMTABLE').map((r) => [r.itemTableID, r.itemName]))
    const categories = new Map(
      rows(db, 'SELECT categoryTableID, childCategoryName FROM CHILDCATEGORYTABLE').map((r) => [
        r.categoryTableID,
        r.childCategoryName,
      ]),
    )
    const accountRows = rows(
      db,
      `SELECT a.accountsTableID id, a.accountName name, IFNULL(t.accountingGroupID, 1) groupId,
              IFNULL(t.accountTypeName, '') typeName
       FROM ACCOUNTSTABLE a LEFT JOIN ACCOUNTTYPETABLE t ON t.accountTypeTableID = a.accountTypeID
       WHERE a.accountsTableID > 0`,
    )
    const accountName = new Map(accountRows.map((r) => [r.id, r.name]))

    // Account definitions with type + usage; opening balances come from
    // type-2 rows. BlueCoins "Investments" accounts map to usage 'investment'
    // so they feed greuro's growth forecast (and are transfer-only).
    const accountDefs = new Map()
    for (const r of accountRows) {
      accountDefs.set(String(r.name).trim().toLowerCase(), {
        name: String(r.name).trim(),
        type: r.groupId === 2 ? 'liability' : 'asset',
        usage: /investment/i.test(r.typeName) ? 'investment' : 'active',
        startingBalance: 0,
      })
    }
    for (const r of rows(
      db,
      `SELECT accountID, amount FROM TRANSACTIONSTABLE
       WHERE transactionTypeID = 2 AND deletedTransaction != 5`,
    )) {
      const name = accountName.get(r.accountID)
      const def = name && accountDefs.get(name.trim().toLowerCase())
      if (def) {
        const value = (Number(r.amount) || 0) / MICRO
        def.startingBalance += def.type === 'liability' ? Math.abs(value) : value
      }
    }

    // ---- transactions ----
    const txRows = rows(
      db,
      `SELECT transactionsTableID id, itemID, amount, date, transactionTypeID typeId,
              categoryID, accountID, accountPairID, notes, deletedTransaction deleted
       FROM TRANSACTIONSTABLE
       WHERE transactionTypeID IN (3, 4, 5)
       ORDER BY date`,
    )

    const today = todayNoon()
    const parsed = []
    const skipped = []

    txRows.forEach((r, index) => {
      if (r.deleted === 5) {
        skipped.push({ index, reason: 'Deleted in BlueCoins' })
        return
      }
      const date = parseSqliteDate(r.date)
      if (date == null) {
        skipped.push({ index, reason: 'Unreadable date' })
        return
      }
      if (date > today) {
        // Pre-generated future reminder occurrence — hasn't happened yet.
        skipped.push({ index, reason: 'Future scheduled occurrence' })
        return
      }
      const raw = (Number(r.amount) || 0) / MICRO
      if (raw === 0) {
        skipped.push({ index, reason: 'Zero amount' })
        return
      }

      const itemName = String(items.get(r.itemID) ?? '').trim()
      const notes = String(r.notes ?? '').trim()
      const description = PLACEHOLDER_NAMES.has(itemName.toLowerCase())
        ? notes
        : itemName || notes

      if (r.typeId === 5) {
        // Keep only the negative (source) half; its pair id is the destination.
        if (raw >= 0) return
        parsed.push({
          type: 'transfer',
          amount: Math.abs(raw),
          date,
          description,
          category: null,
          fromAccount: accountName.get(r.accountID) ?? null,
          toAccount: accountName.get(r.accountPairID) ?? null,
        })
        return
      }

      parsed.push({
        type: r.typeId === 4 ? 'income' : 'expense',
        amount: Math.abs(raw),
        date,
        description,
        category: String(categories.get(r.categoryID) ?? '').trim() || null,
        account: accountName.get(r.accountID) ?? null,
      })
    })

    parsed.sort((a, b) => a.date - b.date)
    return { parsed, skipped, accountDefs }
  } finally {
    db.close()
  }
}
