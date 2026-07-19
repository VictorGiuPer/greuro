/**
 * record-demo.mjs — records a real screen-capture walkthrough of the built app.
 *
 * What it does:
 *   1. Builds the app if `dist/` is missing (pass --build to force a rebuild).
 *   2. Serves `dist/` with `vite preview` on a fixed port.
 *   3. Launch 1 (no video): opens the app in a throwaway Chrome profile and
 *      seeds a rich, deterministic demo dataset straight into IndexedDB —
 *      ~6 months of transactions, accounts, categories, reminders, settings.
 *   4. Launch 2 (video on, same profile): boots the now-populated app and
 *      calmly walks through it like a person on a phone — Overview (periods,
 *      donut, focus view, cards, forecast), Transactions (scroll, quick add),
 *      Reminders, and Settings (accounts + categories).
 *   5. Saves demo/greuro-demo.mp4 (H.264, plays anywhere / social-media
 *      ready) via the ffmpeg-static devDependency.
 *
 * Run:  node scripts/record-demo.mjs
 * (npm script: `npm run demo:record` — remember node/npm need the full path
 *  on this machine: & "C:\Program Files\nodejs\node.cmd" ...)
 */
import { chromium } from 'playwright-core'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, renameSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4317
const APP_URL = `http://localhost:${PORT}/greuro/`
const OUT_DIR = path.join(ROOT, 'demo')
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean)
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!CHROME) throw new Error('Chrome not found — set CHROME_PATH')

// Phone-sized stage. Video is recorded at 2x for sharpness.
const VIEWPORT = { width: 390, height: 844 }
const VIDEO_SIZE = { width: 780, height: 1688 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Demo data — deterministic (seeded PRNG) but generated relative to "today",
// so the app always looks current: history fills the last ~6 months and
// reminders come due in the next days/weeks.
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

const DAY = 86_400_000
const noon = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
const TODAY = noon(new Date())

/** Next occurrence of a given day-of-month strictly after today (day <= 28). */
function nextDom(day) {
  const t = new Date(TODAY)
  const thisMonth = new Date(t.getFullYear(), t.getMonth(), day, 12).getTime()
  if (thisMonth > TODAY) return thisMonth
  return new Date(t.getFullYear(), t.getMonth() + 1, day, 12).getTime()
}

function buildDemoData() {
  const rng = makeRng(20260710)
  const r2 = (x) => Math.round(x * 100) / 100
  const pick = (arr) => arr[Math.floor(rng() * arr.length)]

  const accounts = [
    { name: 'Checking', type: 'asset', startingBalance: 3200, expectedAnnualReturn: 0 },
    { name: 'Savings', type: 'asset', startingBalance: 12500, expectedAnnualReturn: 3 },
    { name: 'ETF Portfolio', type: 'asset', startingBalance: 24000, expectedAnnualReturn: 8 },
    { name: 'Credit Card', type: 'liability', startingBalance: 480, expectedAnnualReturn: 0 },
  ].map((a) => ({ ...a, createdAt: TODAY - 200 * DAY }))

  const categories = [
    { name: 'Housing', color: '#2EE8C6', icon: 'Home', kind: 'expense' },
    { name: 'Groceries', color: '#6EE7B7', icon: 'ShoppingCart', kind: 'expense' },
    { name: 'Dining Out', color: '#F472B6', icon: 'Utensils', kind: 'expense' },
    { name: 'Transport', color: '#60A5FA', icon: 'Car', kind: 'expense' },
    { name: 'Shopping', color: '#FBBF24', icon: 'ShoppingBag', kind: 'expense' },
    { name: 'Entertainment', color: '#A78BFA', icon: 'Music', kind: 'expense' },
    { name: 'Health & Fitness', color: '#F87171', icon: 'Dumbbell', kind: 'expense' },
    { name: 'Utilities', color: '#6366F1', icon: 'Wifi', kind: 'expense' },
    { name: 'Travel', color: '#F59E0B', icon: 'Plane', kind: 'expense' },
    { name: 'Salary', color: '#4ADE80', icon: 'Briefcase', kind: 'income' },
    { name: 'Freelance', color: '#2EE8C6', icon: 'Wallet', kind: 'income' },
  ].map((c) => ({ ...c, createdAt: TODAY - 200 * DAY }))

  const tx = []
  const add = (date, type, amount, description, cat, acct, from, to) =>
    tx.push({ date, type, amount: r2(amount), description, cat: cat ?? null, acct: acct ?? null, from: from ?? null, to: to ?? null })

  // Fixed monthly events for the last 6 calendar months (skipping future days).
  const t0 = new Date(TODAY)
  for (let mOff = 5; mOff >= 0; mOff--) {
    const y = t0.getFullYear()
    const m = t0.getMonth() - mOff
    const on = (day) => new Date(y, m, day, 12).getTime()
    const monthly = [
      // Payday lands on the 1st (with rent) so the month-to-date view is
      // realistic from the very start of the month, not underwater till payday.
      [1, () => add(on(1), 'income', 3480, 'Salary', 'Salary', 'Checking')],
      [1, () => add(on(1), 'expense', 1150, 'Rent', 'Housing', 'Checking')],
      [1, () => add(on(1), 'expense', 49, 'Deutschlandticket', 'Transport', 'Checking')],
      [2, () => add(on(2), 'transfer', 400, 'Monthly saving', null, null, 'Checking', 'Savings')],
      [2, () => add(on(2), 'transfer', 300, 'ETF savings plan', null, null, 'Checking', 'ETF Portfolio')],
      [3, () => add(on(3), 'expense', 58 + rng() * 22, 'Electricity', 'Utilities', 'Checking')],
      [5, () => add(on(5), 'expense', 39.99, 'Internet & Mobile', 'Utilities', 'Checking')],
      [12, () => add(on(12), 'expense', 29.9, 'Gym membership', 'Health & Fitness', 'Checking')],
      [15, () => add(on(15), 'expense', 12.99, 'Netflix', 'Entertainment', 'Credit Card')],
      [20, () => add(on(20), 'expense', 10.99, 'Spotify', 'Entertainment', 'Credit Card')],
    ]
    for (const [day, emit] of monthly) if (on(day) <= TODAY) emit()
  }

  // Organic day-to-day activity.
  const start = new Date(t0.getFullYear(), t0.getMonth() - 5, 1, 12).getTime()
  for (let d = start; d <= TODAY; d += DAY) {
    if (rng() < 0.34)
      add(d, 'expense', 12 + rng() * 66, pick(['REWE', 'Lidl', 'Edeka', 'ALDI', 'Netto']), 'Groceries', rng() < 0.25 ? 'Credit Card' : 'Checking')
    if (rng() < 0.18)
      add(d, 'expense', 9 + rng() * 38, pick(['Cafe Milano', 'Pizzeria Roma', 'Sushi Corner', 'Burger Haus', 'Thai Garden']), 'Dining Out', 'Credit Card')
    if (rng() < 0.22)
      add(d, 'expense', 3.2 + rng() * 2.2, pick(['Coffee House', 'Backhaus Cafe']), 'Dining Out', 'Checking')
    if (rng() < 0.06)
      add(d, 'expense', 52 + rng() * 26, pick(['Shell', 'Aral']), 'Transport', 'Checking')
    if (rng() < 0.08)
      add(d, 'expense', 14 + rng() * 110, pick(['Amazon', 'H&M', 'MediaMarkt', 'dm-drogerie markt']), 'Shopping', 'Credit Card')
    if (rng() < 0.03) add(d, 'expense', 8 + rng() * 20, 'Pharmacy', 'Health & Fitness', 'Checking')
    if (rng() < 0.04)
      add(d, 'expense', 12 + rng() * 26, pick(['Cinema', 'Concert tickets', 'Bowling']), 'Entertainment', 'Credit Card')
    if (rng() < 0.025) add(d, 'income', 380 + rng() * 440, 'Freelance project', 'Freelance', 'Checking')
  }

  // A one-off trip so Travel shows up.
  add(TODAY - 45 * DAY, 'expense', 189.99, 'Flight to Lisbon', 'Travel', 'Credit Card')
  add(TODAY - 44 * DAY, 'expense', 246.0, 'Hotel Lisbon (3 nights)', 'Travel', 'Credit Card')

  // Reminders (scheduled transactions). All due AFTER today so nothing
  // auto-posts mid-recording; the near ones light up the Due Soon badges.
  const sched = (row) => ({
    lastPostedDate: null,
    createdAt: TODAY - 90 * DAY,
    updatedAt: TODAY - 90 * DAY,
    active: 1,
    ...row,
    startDate: row.nextDueDate,
    anchorDay: new Date(row.nextDueDate).getDate(),
  })
  const monthlyRec = { unit: 'month', interval: 1 }
  const nov15 = (() => {
    const y = t0.getMonth() >= 10 && t0.getDate() > 15 ? t0.getFullYear() + 1 : t0.getFullYear()
    const ts = new Date(y, 10, 15, 12).getTime()
    return ts > TODAY ? ts : new Date(y + 1, 10, 15, 12).getTime()
  })()

  const scheduled = [
    sched({ type: 'expense', amount: 29.9, description: 'Gym membership', cat: 'Health & Fitness', acct: 'Checking', recurrence: monthlyRec, nextDueDate: TODAY + 2 * DAY }),
    sched({ type: 'expense', amount: 12.99, description: 'Netflix', cat: 'Entertainment', acct: 'Credit Card', recurrence: monthlyRec, nextDueDate: TODAY + 5 * DAY }),
    sched({ type: 'expense', amount: 10.99, description: 'Spotify', cat: 'Entertainment', acct: 'Credit Card', recurrence: monthlyRec, nextDueDate: TODAY + 10 * DAY }),
    sched({ type: 'expense', amount: 1150, description: 'Rent', cat: 'Housing', acct: 'Checking', recurrence: monthlyRec, nextDueDate: nextDom(1) }),
    sched({ type: 'expense', amount: 49, description: 'Deutschlandticket', cat: 'Transport', acct: 'Checking', recurrence: monthlyRec, nextDueDate: nextDom(1) }),
    sched({ type: 'expense', amount: 39.99, description: 'Internet & Mobile', cat: 'Utilities', acct: 'Checking', recurrence: monthlyRec, nextDueDate: nextDom(5) }),
    sched({ type: 'income', amount: 3480, description: 'Salary', cat: 'Salary', acct: 'Checking', recurrence: monthlyRec, nextDueDate: nextDom(1) }),
    sched({ type: 'transfer', amount: 400, description: 'Monthly saving', from: 'Checking', to: 'Savings', recurrence: monthlyRec, nextDueDate: nextDom(2) }),
    sched({ type: 'transfer', amount: 300, description: 'ETF savings plan', from: 'Checking', to: 'ETF Portfolio', recurrence: monthlyRec, nextDueDate: nextDom(2) }),
    sched({ type: 'expense', amount: 486.5, description: 'Car insurance', cat: 'Transport', acct: 'Checking', recurrence: { unit: 'year', interval: 1 }, nextDueDate: nov15 }),
    sched({ type: 'expense', amount: 45, description: 'Yoga class', cat: 'Health & Fitness', acct: 'Checking', recurrence: monthlyRec, nextDueDate: TODAY + 12 * DAY, active: 0 }),
  ]

  // Wider pess/base/opt spread than the 5/7/9 default so the forecast band
  // fans out visibly; a heftier monthly investment routes surplus into the
  // 8 %-return ETF so the curve bends (compounds) instead of tracking the
  // flat cash pile in Checking.
  const settings = {
    onboarded: true,
    monthlyInvestment: 700,
    returnPess: 3,
    returnBase: 7,
    returnOpt: 12,
  }

  return { accounts, categories, transactions: tx, scheduled, settings }
}

// ---------------------------------------------------------------------------
// Seeding — raw IndexedDB writes from inside the page (the app created the
// schema on first load; we only fill it, then flag onboarding as done).
// ---------------------------------------------------------------------------
async function seedInPage(page, payload) {
  return page.evaluate(async (data) => {
    const openReq = indexedDB.open('BudgetDB')
    const db = await new Promise((res, rej) => {
      openReq.onsuccess = () => res(openReq.result)
      openReq.onerror = () => rej(openReq.error)
    })
    const stores = ['accounts', 'categories', 'transactions', 'scheduled', 'settings']
    const tx = db.transaction(stores, 'readwrite')
    const req = (r) =>
      new Promise((res, rej) => {
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
    for (const s of stores) await req(tx.objectStore(s).clear())

    const acctIds = {}
    const catIds = {}
    for (const a of data.accounts) acctIds[a.name] = await req(tx.objectStore('accounts').add(a))
    for (const c of data.categories) catIds[c.name] = await req(tx.objectStore('categories').add(c))

    for (const t of data.transactions) {
      await req(
        tx.objectStore('transactions').add({
          type: t.type,
          amount: t.amount,
          date: t.date,
          description: t.description,
          categoryId: t.cat ? catIds[t.cat] : null,
          accountId: t.acct ? acctIds[t.acct] : null,
          fromAccountId: t.from ? acctIds[t.from] : null,
          toAccountId: t.to ? acctIds[t.to] : null,
          createdAt: t.date,
          updatedAt: t.date,
        }),
      )
    }
    for (const s of data.scheduled) {
      const { cat, acct, from, to, ...rest } = s
      await req(
        tx.objectStore('scheduled').add({
          ...rest,
          categoryId: cat ? catIds[cat] : null,
          accountId: acct ? acctIds[acct] : null,
          fromAccountId: from ? acctIds[from] : null,
          toAccountId: to ? acctIds[to] : null,
        }),
      )
    }
    for (const [key, value] of Object.entries(data.settings))
      await req(tx.objectStore('settings').put({ key, value }))
    await req(tx.objectStore('settings').put({ key: 'cashFlowAccountId', value: acctIds['Checking'] }))

    await new Promise((res, rej) => {
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
    })
    db.close()
    return { transactions: data.transactions.length, scheduled: data.scheduled.length }
  }, payload)
}

// ---------------------------------------------------------------------------
// Build + serve
// ---------------------------------------------------------------------------
function ensureBuilt() {
  const force = process.argv.includes('--build')
  if (!force && existsSync(path.join(ROOT, 'dist', 'index.html'))) return
  console.log('Building app (vite build)…')
  const res = spawnSync(process.execPath, [VITE_BIN, 'build'], { cwd: ROOT, stdio: 'inherit' })
  if (res.status !== 0) throw new Error('vite build failed')
}

async function startPreview() {
  const child = spawn(process.execPath, [VITE_BIN, 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(APP_URL)
      if (r.ok) return child
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  child.kill()
  throw new Error(`Preview server did not come up on port ${PORT}`)
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------
const CONTEXT_OPTS = {
  executablePath: CHROME,
  headless: true,
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
  // Renders the compositor surface at 2x so the screencast frames actually
  // arrive at VIDEO_SIZE — without this the video is 1x padded with gray.
  args: ['--force-device-scale-factor=2'],
}

/** Android-style "show taps" dot so viewers can follow interactions. */
const TAP_DOT = () => {
  addEventListener(
    'pointerdown',
    (e) => {
      const d = document.createElement('div')
      d.style.cssText =
        `position:fixed;left:${e.clientX - 17}px;top:${e.clientY - 17}px;` +
        'width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.22);' +
        'border:1.5px solid rgba(255,255,255,.38);z-index:2147483647;pointer-events:none;' +
        'transition:transform .45s ease,opacity .45s ease;transform:scale(.55);opacity:1'
      document.body.appendChild(d)
      requestAnimationFrame(() => {
        d.style.transform = 'scale(1.35)'
        d.style.opacity = '0'
      })
      setTimeout(() => d.remove(), 600)
    },
    true,
  )
}

async function smoothScroll(page, deltaY, settle = 900) {
  await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), deltaY)
  await sleep(settle)
}

async function smoothScrollIntoView(locator, settle = 1100) {
  await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await sleep(settle)
}

// ---------------------------------------------------------------------------
// The tour — brisk but readable; targets ~30 seconds total.
// ---------------------------------------------------------------------------
async function tour(page) {
  const click = (locator) => locator.click({ delay: 50 })

  // --- Boot: splash → Overview with charts.
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.recharts-surface', { timeout: 20000 })
  await sleep(1400)

  // --- Period filter, low to high: Week → Month → Quarter → Year → Custom.
  for (const p of ['Week', 'Month', 'Quarter', 'Year', 'Custom']) {
    await click(page.getByRole('button', { name: p, exact: true }))
    await sleep(p === 'Custom' ? 1000 : 750)
  }
  // Settle back on Month for the rest of the tour.
  await click(page.getByRole('button', { name: 'Month', exact: true }))
  await sleep(600)

  // --- Tap the donut → focused spending view; toggle one category.
  await click(page.getByRole('button', { name: 'Open focused spending view' }))
  const focus = page.locator('[role="dialog"][aria-label="Spending by category"]')
  await sleep(1200)
  const catRows = focus.locator('button[aria-pressed]')
  await click(catRows.nth(0))
  await sleep(800)
  await click(focus.getByRole('button', { name: 'Back' }))
  await sleep(600)

  // --- Cards: net earnings + cash flow, then the forecast.
  await smoothScroll(page, 380, 800)
  const forecast = page.locator('section', { hasText: 'Net Worth Forecast' }).last()
  await smoothScrollIntoView(forecast, 900)
  // Horizon low to high: 1y → 5y → 10y → 20y.
  const horizons = page.locator('[aria-label="Forecast horizon"] button')
  for (let i = 0; i < 4; i++) {
    await click(horizons.nth(i))
    await sleep(i === 3 ? 900 : 650)
  }

  // --- Transactions: browse the list, then a quick add.
  await click(page.locator('nav button', { hasText: 'Transactions' }))
  await sleep(1100)
  await smoothScroll(page, 620, 750)
  await smoothScroll(page, 620, 750)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  await sleep(600)

  await click(page.getByRole('button', { name: 'Add transaction' }))
  const sheet = page.locator('[role="dialog"][aria-label="New transaction"]')
  await sleep(700)
  await sheet.locator('#tx-amount').pressSequentially('4,80', { delay: 60 })
  await sheet.locator('input[placeholder="Merchant or name"]').pressSequentially('Cappuccino', { delay: 40 })
  await sheet.locator('select').nth(0).selectOption({ label: 'Checking' })
  await sleep(350)
  await sheet.locator('select').nth(1).selectOption({ label: 'Dining Out' })
  await sleep(500)
  await click(sheet.getByRole('button', { name: 'Add Transaction' }))
  await sleep(1200)

  // --- Reminders: upcoming items with their Due Soon / Paused states.
  await click(page.locator('nav button', { hasText: 'Reminders' }))
  await sleep(1200)
  await smoothScroll(page, 340, 900)

  // --- Settings: accounts, then categories.
  await click(page.locator('nav button', { hasText: 'Overview' }))
  await sleep(500)
  await click(page.getByRole('button', { name: 'Settings', exact: true }))
  const settings = page.locator('[role="dialog"][aria-label="Settings"]')
  await sleep(1200)
  await smoothScrollIntoView(settings.getByRole('heading', { name: 'Categories' }).first(), 1100)
  await click(settings.getByRole('button', { name: 'Back', exact: true }))
  await sleep(900)
}

// ---------------------------------------------------------------------------
// MP4 conversion — H.264/yuv420p so the file opens anywhere (Windows, phones,
// social media). Uses the ffmpeg-static devDependency, falling back to PATH.
// ---------------------------------------------------------------------------
function ffmpegBin() {
  const staticFfmpeg = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
  return existsSync(staticFfmpeg) ? staticFfmpeg : 'ffmpeg'
}

function tryMp4(webmPath) {
  const mp4Path = webmPath.replace(/\.webm$/, '.mp4')
  const res = spawnSync(
    ffmpegBin(),
    ['-y', '-i', webmPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4Path],
    { stdio: 'ignore', shell: false },
  )
  return res.status === 0 ? mp4Path : null
}

/**
 * Social-feed reframes of the portrait capture.
 *
 * The phone capture is ~1:2.16, far taller than any feed wants — posted as-is
 * it eats the whole viewport and pushes the post's text out of view. So we fit
 * the untouched recording inside a wider canvas (never cropping the UI) and
 * fill the sides with the app's OWN background colour, so the bars read as part
 * of the design rather than as letterboxing.
 *
 * 1:1  — squarest, smallest feed footprint, app is smallest.
 * 4:5  — LinkedIn's tallest "polite" portrait; a bigger app, still leaves the
 *        caption visible. Good middle ground.
 */
const CANVAS_BG = '0x0A0B0F' // --bg, same as the app shell
const REFRAMES = [
  { label: 'square', width: 1080, height: 1080 },
  { label: '4x5', width: 1080, height: 1350 },
]

function reframe(mp4Path, { label, width, height }) {
  const out = mp4Path.replace(/\.mp4$/, `-${label}.mp4`)
  const vf = [
    // Fit inside the canvas without cropping; lanczos keeps the text crisp.
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
    // Even dims keep yuv420p chroma happy.
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${CANVAS_BG}`,
    // Square pixels, or players render the canvas slightly off-aspect.
    'setsar=1',
  ].join(',')
  const res = spawnSync(
    ffmpegBin(),
    ['-y', '-i', mp4Path, '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out],
    { stdio: 'ignore', shell: false },
  )
  return res.status === 0 ? out : null
}

// ---------------------------------------------------------------------------
async function main() {
  ensureBuilt()
  mkdirSync(OUT_DIR, { recursive: true })
  const profileDir = mkdtempSync(path.join(tmpdir(), 'greuro-demo-'))
  const server = await startPreview()
  console.log(`Preview server up at ${APP_URL}`)

  try {
    // Launch 1 — seed the demo data (not recorded).
    console.log('Seeding demo data…')
    {
      const ctx = await chromium.launchPersistentContext(profileDir, CONTEXT_OPTS)
      const page = ctx.pages()[0] ?? (await ctx.newPage())
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
      // The app creates the DB schema on boot; wait until it exists.
      await page.waitForFunction(
        async () => (await indexedDB.databases()).some((d) => d.name === 'BudgetDB' && d.version > 0),
        { timeout: 20000 },
      )
      const counts = await seedInPage(page, buildDemoData())
      console.log(`Seeded ${counts.transactions} transactions, ${counts.scheduled} reminders.`)
      await ctx.close()
    }

    // Launch 2 — record the walkthrough on the populated app.
    console.log('Recording walkthrough…')
    const ctx = await chromium.launchPersistentContext(profileDir, {
      ...CONTEXT_OPTS,
      recordVideo: { dir: OUT_DIR, size: VIDEO_SIZE },
    })
    await ctx.addInitScript(TAP_DOT)
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    try {
      await tour(page)
    } catch (err) {
      // Keep a still of where the tour got stuck before bailing.
      await page.screenshot({ path: path.join(OUT_DIR, 'debug-failure.png') }).catch(() => {})
      await ctx.close().catch(() => {})
      throw err
    }
    const video = page.video()
    await ctx.close() // flushes the video file
    const rawPath = await video.path()

    const finalWebm = path.join(OUT_DIR, 'greuro-demo.webm')
    rmSync(finalWebm, { force: true })
    try {
      renameSync(rawPath, finalWebm)
    } catch {
      copyFileSync(rawPath, finalWebm)
      rmSync(rawPath, { force: true })
    }
    // Sweep stray per-page recordings (blank helper pages, failed runs).
    for (const f of readdirSync(OUT_DIR))
      if (f.startsWith('page@') && f.endsWith('.webm')) rmSync(path.join(OUT_DIR, f), { force: true })
    const mp4 = tryMp4(finalWebm)
    if (!mp4) {
      console.log(`\nMP4 conversion failed — kept ${finalWebm} (plays in any browser).`)
      return
    }
    rmSync(finalWebm, { force: true }) // the mp4s are the shareable deliverables
    console.log(`\nVideo saved (phone-shaped): ${mp4}`)

    for (const spec of REFRAMES) {
      const out = reframe(mp4, spec)
      if (out) console.log(`  ${spec.width}x${spec.height} (${spec.label}): ${out}`)
    }
  } finally {
    server.kill()
    // Best-effort: Chrome can hold locks in the temp profile briefly.
    try {
      rmSync(profileDir, { recursive: true, force: true })
    } catch {
      /* leftover temp profile is harmless */
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
