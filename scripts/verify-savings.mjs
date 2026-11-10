// Isolated browser verification. All Supabase traffic is mocked; no real data
// or credentials are read or changed.
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { savingsPool } from '../src/lib/savings.js'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4319', '--strictPort'], { windowsHide: true, stdio: 'pipe', env: { ...process.env, VITE_SUPABASE_URL: 'https://test.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-only-key' } })
let ready = false
server.stdout.on('data', (chunk) => { if (chunk.toString().includes('Local:')) ready = true })
for (let i = 0; i < 100 && !ready; i++) await delay(100)
if (!ready) { server.kill(); throw new Error('Isolated Vite server did not start') }
await mkdir('.test-tmp/screenshots', { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Brussels' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => { errors.push(e.message); console.error('Browser error:', e.message) })
  const now = Date.now()
  let revision = 1
  let data = {
    accounts: [{ id: 1, name: 'Checking', type: 'asset', usage: 'active', startingBalance: 2000, expectedAnnualReturn: 0 }, { id: 2, name: 'Cash', type: 'asset', usage: 'active', startingBalance: 200, expectedAnnualReturn: 0 }, { id: 3, name: 'Investments', type: 'asset', usage: 'investment', startingBalance: 3000, expectedAnnualReturn: 5 }],
    categories: [{ id: 1, name: 'Travel', kind: 'expense', color: '#a78bfa', icon: 'Plane' }, { id: 2, name: 'Salary', kind: 'income', color: '#2ee8c6', icon: 'Briefcase' }],
    transactions: [{ id: 1, type: 'expense', amount: 300, description: 'Flights', date: now, accountId: 1, categoryId: 1, tripId: 1, goalId: 1, fundedAmount: 300 }],
    trips: [{ id: 1, name: 'Japan', days: 10, goalId: 1, archived: 0 }],
    goals: [{ id: 1, name: 'Japan', targetAmount: 1000, earmarked: 700, modelVersion: 2, archived: 0 }],
    settings: [{ key: 'onboarded', value: true }, { key: 'mainAccountId', value: 1 }, { key: 'lastBackupAt', value: now }], scheduled: [],
  }
  for (let i = 1; i <= 5; i++) {
    const date = new Date(); date.setMonth(date.getMonth() - i, 10)
    data.transactions.push({ id: 2 * i, type: 'income', amount: 1000, date: +date, accountId: 1, categoryId: 2, description: 'Salary' }, { id: 2 * i + 1, type: 'expense', amount: i === 2 ? 1100 : 500, date: +date, accountId: 1, categoryId: 1, description: 'Spending' })
  }
  const user = { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated' }
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', exp: 4102444800 })).toString('base64url')}.test`
  await page.route('**/auth/v1/**', async (route) => {
    const payload = route.request().url().includes('/user') ? user : { access_token: token, refresh_token: 'test-only', token_type: 'bearer', expires_in: 3600, user }
    await route.fulfill({ json: payload })
  })
  await page.route('**/rest/v1/budget_backups*', (route) => route.fulfill({ json: { user_id: user.id, updated_at: `r${revision}`, data: { format: 'budget-app-backup', version: 1, data } } }))
  await page.route('**/rest/v1/rpc/save_budget_backup', async (route) => {
    const input = route.request().postDataJSON()
    if (input.p_expected_updated_at !== `r${revision}`) return route.fulfill({ status: 409, json: { message: 'Stale revision' } })
    data = input.p_data.data; revision++
    await route.fulfill({ json: `r${revision}` })
  })
  await page.goto('http://127.0.0.1:4319/greuro/')
  await page.getByLabel('Email', { exact: true }).fill('test@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('test-only-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const nav = page.locator('nav')
  await nav.waitFor()
  assert.deepEqual(await nav.getByRole('button').allTextContents(), ['Overview', 'Transactions', 'Reminders', 'Savings', 'Owed'])
  await nav.getByRole('button', { name: 'Savings', exact: true }).click()
  await page.getByRole('heading', { name: 'Monthly allocation' }).waitFor()
  await page.getByLabel('Savings goal', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-allocation-month]').count(), 4)
  assert.equal(await page.getByLabel('Average period').inputValue(), '3')
  const beforeAllocationTransactions = JSON.stringify(data.transactions)
  await page.getByLabel('Average period').selectOption('12')
  await page.waitForFunction(() => document.querySelector('select[aria-label="Average period"]')?.value === '12' && !document.querySelector('select[aria-label="Average period"]')?.disabled)
  assert.equal(data.settings.find((s) => s.key === 'savingsAverageMonths').value, 12)
  assert.equal(await page.locator('[data-allocation-month]').count(), 4)
  await page.getByLabel('Average period').selectOption('4')
  await page.waitForFunction(() => document.querySelector('select[aria-label="Average period"]')?.value === '4' && !document.querySelector('select[aria-label="Average period"]')?.disabled)
  assert.equal(data.settings.find((s) => s.key === 'savingsAverageMonths').value, 4)
  assert.equal(JSON.stringify(data.transactions), beforeAllocationTransactions)

  assert.equal(await page.locator('body').evaluate((el) => el.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: '.test-tmp/screenshots/savings-top.png', fullPage: true })
  await page.getByText('Time to save', { exact: true }).click()
  await page.getByLabel('Savings calculator goal').selectOption('1')
  await page.getByText('Goal reached', { exact: true }).waitFor()
  assert.equal(await page.getByText('Show archived goals', { exact: true }).count(), 0)
  const amountBox = await page.getByLabel('Reserve or release amount').boundingBox()
  const reserveBox = await page.getByRole('button', { name: 'Reserve', exact: true }).boundingBox()
  const releaseBox = await page.getByRole('button', { name: 'Release', exact: true }).boundingBox()
  assert.ok(Math.abs(amountBox.y - reserveBox.y) < 2 && Math.abs(amountBox.y - releaseBox.y) < 2)
  await page.getByLabel('Reserve or release amount').fill('25')
  await page.getByRole('button', { name: 'Reserve', exact: true }).click()
  await page.waitForFunction(() => document.body.textContent.includes('725'))
  assert.equal(data.goals[0].earmarked, 725)
  // Pay from cash while drawing on the same goal, with no transfer.
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click()
  const transaction = page.getByRole('dialog', { name: /new transaction/i })
  await transaction.getByRole('textbox', { name: 'Amount (supports calculations)', exact: true }).fill('40')
  await transaction.getByPlaceholder('Merchant or name').fill('Cash lunch')
  await transaction.locator('select').nth(0).selectOption('2')
  await transaction.locator('select').nth(1).selectOption('1')
  await transaction.getByRole('button', { name: 'Optional', exact: true }).click()
  await transaction.getByLabel('Trip', { exact: true }).selectOption('1')
  assert.equal(await transaction.getByLabel('Use savings goal').inputValue(), '1')
  await transaction.getByRole('button', { name: 'Add Transaction', exact: true }).click()
  await transaction.waitFor({ state: 'hidden' })
  assert.equal(data.goals[0].earmarked, 685)
  assert.equal(data.transactions.filter((t) => t.type === 'transfer').length, 0)
  // Unrelated spending requires an explicit release rounded from an �18 gap.
  const spend = savingsPool(data).available + 18
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click()
  await transaction.getByRole('textbox', { name: 'Amount (supports calculations)', exact: true }).fill(String(spend))
  await transaction.getByPlaceholder('Merchant or name').fill('Unrelated purchase')
  await transaction.locator('select').nth(0).selectOption('1')
  await transaction.locator('select').nth(1).selectOption('1')
  await transaction.getByRole('button', { name: 'Add Transaction', exact: true }).click()
  const release = transaction.getByRole('group', { name: 'Release savings', exact: true })
  await release.waitFor()
  await release.getByRole('button', { name: /25,00/, exact: false }).click()
  await release.getByRole('button', { name: 'Release & save', exact: true }).click()
  await transaction.waitFor({ state: 'hidden' })
  assert.equal(data.goals[0].earmarked, 660)
  await page.getByRole('heading', { name: 'Savings goals', exact: true }).scrollIntoViewIfNeeded()
  await delay(350)
  await page.screenshot({ path: '.test-tmp/screenshots/goal-progress.png' })
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByText('Create a goal and reserve money for it.').waitFor()
  assert.equal(data.goals[0].archived, 1); assert.equal(data.trips[0].archived, 1); assert.equal(data.goals[0].earmarked, 0)
  await nav.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const tripList = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'See trips' }) })
  const goalList = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'See savings goals' }) })
  assert.equal(await tripList.evaluate((el) => el.open), false)
  assert.equal(await goalList.evaluate((el) => el.open), false)
  await tripList.locator('summary').click()
  await tripList.getByRole('button', { name: /Japan/ }).click()
  await page.getByRole('dialog', { name: /edit trip/i }).getByRole('button', { name: 'Close', exact: true }).click()
  await goalList.locator('summary').click()
  await goalList.getByRole('button', { name: /Japan.*Archived/ }).click()
  const goalEditor = page.getByRole('dialog', { name: 'Edit savings goal', exact: true })
  await goalEditor.getByLabel('Goal name').fill('Japan holiday')
  await goalEditor.getByRole('button', { name: 'Save goal', exact: true }).click()
  await goalEditor.waitFor({ state: 'hidden' })
  assert.equal(data.goals[0].name, 'Japan holiday')
  await goalList.getByRole('button', { name: /Japan holiday.*Archived/ }).click()
  await goalEditor.getByRole('button', { name: 'Reopen goal', exact: true }).click()
  await goalEditor.getByRole('button', { name: 'Confirm', exact: true }).click()
  await goalEditor.waitFor({ state: 'hidden' })
  assert.equal(data.goals[0].archived, 0)
  assert.equal(data.trips[0].archived, 0)
  await page.getByRole('heading', { name: 'Data', exact: true }).scrollIntoViewIfNeeded()
  assert.equal(await page.getByText('Import from BlueCoins', { exact: true }).count(), 0)
  assert.equal(await page.getByText('Erase all data', { exact: true }).count(), 0)
  await page.screenshot({ path: '.test-tmp/screenshots/settings-data.png', fullPage: true })
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Back', exact: true }).click()
  await nav.getByRole('button', { name: 'Savings', exact: true }).click()
  await page.getByLabel('Average period').waitFor()
  assert.equal(await page.getByLabel('Average period').inputValue(), '4')
  assert.deepEqual(errors, [])
  console.log('Four-bar allocation, saved average range, unchanged transactions, mobile goals, Settings, purchases, release and finish checks passed.')
} finally { await browser.close(); server.kill() }
