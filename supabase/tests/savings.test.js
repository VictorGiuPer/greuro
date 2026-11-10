import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

let pg
const user1 = '00000000-0000-0000-0000-000000000001'
const user2 = '00000000-0000-0000-0000-000000000002'
const records = () => ({ accounts: [{ id: 1, name: 'Bank', type: 'asset', startingBalance: 1000 }, { id: 2, name: 'Cash', type: 'asset', startingBalance: 200 }], categories: [{ id: 1, kind: 'expense' }, { id: 2, kind: 'income' }], transactions: [], goals: [{ id: 1, name: 'Trip', targetAmount: 1000, earmarked: 500, modelVersion: 2 }], trips: [{ id: 1, goalId: 1, days: 2 }], settings: [], scheduled: [] })
const snapshot = (data) => ({ format: 'budget-app-backup', version: 1, data })
async function current() { return (await pg.query('select data, updated_at::text as revision from budget_backups')).rows[0] }
async function save(data, revision) { return pg.query('select save_budget_backup($1::jsonb, $2::timestamptz)::text as revision', [JSON.stringify(snapshot(data)), revision ?? (await current()).revision]) }

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`create schema auth; create role authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$; grant usage on schema auth to authenticated; insert into auth.users values ('${user1}'), ('${user2}');`)
  for (const name of ['20261011000000_budget_backups.sql', '20261020000000_granular_transactions.sql', '20261108000000_savings_integrity.sql']) await pg.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
}, 30000)
beforeEach(async () => {
  await pg.exec('reset role; truncate budget_backups;')
  await pg.query('insert into budget_backups(user_id,data) values ($1,$2::jsonb),($3,$4::jsonb)', [user1, JSON.stringify(snapshot(records())), user2, JSON.stringify(snapshot({ ...records(), accounts: [{ id: 99, startingBalance: 2000 }] }))])
  await pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user1}',false);`)
})
afterAll(async () => { if (pg) await pg.close() })

describe('PostgreSQL savings integrity and RLS', () => {
  it('loads the real migration and scopes reads to the signed-in user', async () => {
    const result = await pg.query('select user_id from budget_backups')
    expect(result.rows).toEqual([{ user_id: user1 }])
    await expect(pg.query('update budget_backups set data = data where user_id = $1 returning user_id', [user2])).resolves.toMatchObject({ rows: [] })
  })
  it('rejects uncovered reservations and rolls back data and revision', async () => {
    const before = await current(); const d = records(); d.goals[0].earmarked = 1300
    await expect(save(d)).rejects.toThrow('Release reserved')
    expect(await current()).toEqual(before)
  })
  it('accepts pooled cash/card goal spending without transfers', async () => {
    const d = records(); d.goals[0].earmarked = 160
    d.transactions.push({ id: 1, type: 'expense', amount: 300, accountId: 1, categoryId: 1, goalId: 1, fundedAmount: 300, date: 1000 }, { id: 2, type: 'expense', amount: 40, accountId: 2, categoryId: 1, goalId: 1, fundedAmount: 40, date: 1000 })
    await save(d)
    expect((await current()).data.data.transactions).toHaveLength(2)
  })
  it('rejects orphan links, invalid funding, and double-restored refunds', async () => {
    let d = records(); d.trips[0].goalId = 999
    await expect(save(d)).rejects.toThrow('Trip goal does not exist')
    d = records(); d.transactions.push({ id: 1, type: 'expense', amount: 100, goalId: 1, fundedAmount: 101, accountId: 1, categoryId: 1 })
    await expect(save(d)).rejects.toThrow('Invalid goal funding')
    d.transactions[0].fundedAmount = 50
    d.transactions.push({ id: 2, type: 'income', amount: 60, goalId: 1, refundOfTransactionId: 1, fundingRestored: 60 })
    await expect(save(d)).rejects.toThrow('Refund exceeds')
  })
  it('accepts explicit scheduled/restore shortfalls and requires valid archive amounts', async () => {
    const d = records(); d.goals[0].earmarked = 1300; d.settings.push({ key: 'savingsResolutionRequired', value: true })
    await save(d)
    d.goals[0].archived = 1
    await expect(save(d)).rejects.toThrow('Archived goals cannot reserve')
  })
  it('rejects stale saves without overwriting the winning revision', async () => {
    const before = await current(); const d = records(); d.goals[0].earmarked = 400
    await save(d, before.revision)
    const winner = await current()
    d.goals[0].earmarked = 300
    await expect(save(d, before.revision)).rejects.toThrow('Budget changed')
    expect(await current()).toEqual(winner)
  })
  it('preserves legacy snapshots until they are explicitly reviewed', async () => {
    const d = records(); d.goals = [{ id: 1, name: 'Legacy', targetAmount: 1000 }]; d.trips = []
    await save(d)
    expect((await current()).data.data.goals[0].modelVersion).toBeUndefined()
  })
})
