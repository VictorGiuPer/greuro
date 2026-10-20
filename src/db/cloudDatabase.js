import { supabase } from '../lib/supabase'

export const CLOUD_TABLES = [
  'accounts', 'categories', 'transactions', 'scheduled', 'settings', 'goals', 'trips',
]

const EMPTY_DATA = () => Object.fromEntries(CLOUD_TABLES.map((name) => [name, []]))
const clone = (value) => structuredClone(value)
const keyFor = (row) => (row?.key != null ? row.key : row?.id)

class CloudCollection {
  constructor(table, operations = []) {
    this.table = table
    this.operations = operations
  }

  filter(predicate) { return new CloudCollection(this.table, [...this.operations, (rows) => rows.filter(predicate)]) }
  and(predicate) { return this.filter(predicate) }
  reverse() { return new CloudCollection(this.table, [...this.operations, (rows) => rows.reverse()]) }
  limit(count) { return new CloudCollection(this.table, [...this.operations, (rows) => rows.slice(0, count)]) }

  async toArray() {
    let rows = await this.table.toArray()
    for (const operation of this.operations) rows = operation(rows)
    return rows
  }
  async count() { return (await this.toArray()).length }
  async first() { return (await this.limit(1).toArray())[0] }
  async sortBy(index) {
    const rows = await this.toArray()
    return rows.sort((a, b) => compareField(a, b, index))
  }
}

class CloudWhereClause {
  constructor(table, index) { this.table = table; this.index = index }
  equals(value) { return this.make((row) => fieldValue(row, this.index) === value) }
  anyOf(values) { const accepted = new Set(values); return this.make((row) => accepted.has(fieldValue(row, this.index))) }
  belowOrEqual(value) { return this.make((row) => compare(fieldValue(row, this.index), value) <= 0) }
  between(lower, upper, includeLower = true, includeUpper = true) {
    return this.make((row) => {
      const value = fieldValue(row, this.index)
      const low = compare(value, lower), high = compare(value, upper)
      return (includeLower ? low >= 0 : low > 0) && (includeUpper ? high <= 0 : high < 0)
    })
  }
  make(predicate) {
    // Dexie index queries iterate in index order, independently of insertion
    // order. Cursor paging relies on this before reverse() and limit().
    return new CloudCollection(this.table, [
      (rows) => rows.filter(predicate).sort((a, b) => compareField(a, b, this.index)),
    ])
  }
}

class CloudTable {
  constructor(database, name) { this.database = database; this.name = name }
  where(index) { return new CloudWhereClause(this, index) }
  orderBy(index) { return new CloudCollection(this, [(rows) => rows.sort((a, b) => compareField(a, b, index))]) }
  filter(predicate) { return new CloudCollection(this, [(rows) => rows.filter(predicate)]) }
  async toArray() { this.database.assertReady(); return clone(this.database.data[this.name]) }
  async get(key) { return (await this.toArray()).find((row) => keyFor(row) === key) }
  async count() { return (await this.toArray()).length }
  async add(row) {
    return this.database.mutate(() => {
      const value = clone(row)
      if (this.name === 'settings') {
        if (this.database.data.settings.some((existing) => existing.key === value.key)) throw new Error('Setting already exists.')
      } else if (value.id == null) {
        value.id = this.database.nextIds[this.name]++
      } else {
        this.database.nextIds[this.name] = Math.max(this.database.nextIds[this.name], Number(value.id) + 1)
      }
      this.database.data[this.name].push(value)
      return keyFor(value)
    })
  }
  async bulkAdd(rows) {
    return this.database.transaction('rw', this, async () => {
      const keys = []
      for (const row of rows) keys.push(await this.add(row))
      return keys
    })
  }
  async put(row) {
    return this.database.mutate(() => {
      const value = clone(row)
      if (this.name !== 'settings' && value.id == null) value.id = this.database.nextIds[this.name]++
      const key = keyFor(value)
      const rows = this.database.data[this.name]
      const index = rows.findIndex((existing) => keyFor(existing) === key)
      if (index < 0) rows.push(value)
      else rows[index] = value
      if (this.name !== 'settings') this.database.nextIds[this.name] = Math.max(this.database.nextIds[this.name], Number(value.id) + 1)
      return key
    })
  }
  async bulkPut(rows) { return this.database.transaction('rw', this, async () => { for (const row of rows) await this.put(row) }) }
  async update(key, changes) {
    return this.database.mutate(() => {
      const row = this.database.data[this.name].find((item) => keyFor(item) === key)
      if (!row) return 0
      Object.assign(row, clone(changes))
      return 1
    })
  }
  async delete(key) {
    return this.database.mutate(() => {
      const rows = this.database.data[this.name]
      const index = rows.findIndex((item) => keyFor(item) === key)
      if (index < 0) return
      rows.splice(index, 1)
    })
  }
  async clear() { return this.database.mutate(() => { this.database.data[this.name] = [] }) }
}

function fieldValue(row, index) {
  if (index === '[date+id]') return [row.date, row.id]
  return row[index]
}
function compare(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return compare(a[0], b[0]) || compare(a[1], b[1])
  return a < b ? -1 : a > b ? 1 : 0
}
function compareField(a, b, index) { return compare(fieldValue(a, index), fieldValue(b, index)) }

/** In-memory working set backed only by the signed-in user's Supabase row. */
export class CloudDatabase {
  constructor(client = supabase) {
    this.client = client
    this.userId = null
    this.data = EMPTY_DATA()
    this.updatedAt = null
    this.ready = false
    this.transactionDepth = 0
    this.tables = CLOUD_TABLES.map((name) => new CloudTable(this, name))
    for (const name of CLOUD_TABLES) this[name] = new CloudTable(this, name)
  }

  assertReady() {
    if (!this.ready || !this.userId) throw new Error('Sign in to access your Supabase budget.')
  }

  async initialize(userId) {
    if (!this.client) throw new Error('Supabase is not configured for this build.')
    const { data: saved, error } = await this.client.from('budget_backups').select('data, updated_at').eq('user_id', userId).maybeSingle()
    if (error) throw error
    this.userId = userId
    this.data = EMPTY_DATA()
    const payload = saved?.data?.data
    if (payload && typeof payload === 'object') {
      for (const name of CLOUD_TABLES) this.data[name] = Array.isArray(payload[name]) ? clone(payload[name]) : []
    }
    this.updatedAt = saved?.updated_at ?? null
    this.nextIds = Object.fromEntries(CLOUD_TABLES.filter((name) => name !== 'settings').map((name) => [name, Math.max(0, ...this.data[name].map((row) => Number(row.id) || 0)) + 1]))
    this.ready = true
    return { isNew: !saved }
  }

  clearSession() {
    this.ready = false
    this.userId = null
    this.updatedAt = null
    this.data = EMPTY_DATA()
    this.nextIds = {}
  }

  async mutate(action) {
    this.assertReady()
    const before = this.transactionDepth === 0 ? clone(this.data) : null
    const result = action()
    if (this.transactionDepth === 0) {
      try { await this.persist() } catch (error) { this.data = before; throw error }
    }
    return result
  }

  async transaction(_mode, ...args) {
    this.assertReady()
    const operation = args.at(-1)
    if (typeof operation !== 'function') throw new Error('Cloud transaction callback is missing.')
    if (this.transactionDepth > 0) {
      this.transactionDepth += 1
      try { return await operation() } finally { this.transactionDepth -= 1 }
    }
    const before = clone(this.data)
    this.transactionDepth = 1
    try {
      const result = await operation()
      this.transactionDepth = 0
      if (JSON.stringify(before) !== JSON.stringify(this.data)) await this.persist()
      return result
    } catch (error) {
      this.transactionDepth = 0
      this.data = before
      throw error
    }
  }

  async persist() {
    this.assertReady()
    const backup = { format: 'budget-app-backup', version: 1, exportedAt: new Date().toISOString(), data: clone(this.data) }
    const { data, error } = await this.client.rpc('save_budget_backup', {
      p_data: backup,
      p_expected_updated_at: this.updatedAt,
    })
    if (error) throw new Error(error.message || 'Could not save to Supabase.')
    if (!data) throw new Error('Supabase did not confirm that the budget was saved.')
    this.updatedAt = data
  }
}

export const cloudDb = new CloudDatabase()
