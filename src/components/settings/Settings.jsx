import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Plus,
  ChevronRight,
  FileSpreadsheet,
  FileJson,
  Upload,
  Sprout,
  Trash2,
} from 'lucide-react'
import {
  addAccount,
  updateAccount,
  deleteAccount,
  addCategory,
  updateCategory,
  deleteCategory,
  getSettings,
  setSettings,
  seedIfEmpty,
} from '../../db'
import { wipeAllData } from '../../db/maintenance'
import { exportBackupFile } from '../../db/backup'
import { exportAllWorkbook } from '../../lib/exportXlsx'
import { formatAmount, formatDate, parseAmountInput, toAmountInputValue } from '../../lib/format'
import CategoryIcon from '../CategoryIcon'
import InstallAppButton from '../InstallAppButton'
import AccountForm from './AccountForm'
import CategoryForm from './CategoryForm'
import ImportJson from './ImportJson'
import BlueCoinsImport from './BlueCoinsImport'

/**
 * Full-screen Settings overlay for managing accounts and categories. Reads the
 * current lists from props; after any mutation it calls onChanged() so the
 * parent reloads and passes fresh props (which also refreshes the Transaction
 * form's dropdowns).
 */
export default function Settings({ open, onClose, accounts, categories, onChanged }) {
  // editor = null | { type:'account'|'category', item: object|null }
  const [editor, setEditor] = useState(null)
  // Preferences form (strings; German comma decimals allowed).
  const [prefs, setPrefs] = useState(null)
  const [prefsNote, setPrefsNote] = useState('')
  // Data-management state.
  const [dataView, setDataView] = useState(null) // null | 'json' | 'bluecoins'
  const [dataNote, setDataNote] = useState('')
  const [wipeText, setWipeText] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastBackupAt, setLastBackupAt] = useState(null)

  // Reset + (re)load preferences whenever the overlay is (re)opened.
  useEffect(() => {
    if (!open) return
    setEditor(null)
    setDataView(null)
    setDataNote('')
    setPrefsNote('')
    setWipeText('')
    getSettings().then((s) => {
      setLastBackupAt(s.lastBackupAt)
      setPrefs({
        returnPess: toAmountInputValue(s.returnPess),
        returnBase: toAmountInputValue(s.returnBase),
        returnOpt: toAmountInputValue(s.returnOpt),
        inflationRate: toAmountInputValue(s.inflationRate),
        dueSoonAmberDays: String(s.dueSoonAmberDays),
        dueSoonTealDays: String(s.dueSoonTealDays),
      })
    })
  }, [open])

  async function savePrefs() {
    const num = (v, fallback) => {
      const n = parseAmountInput(v)
      return Number.isFinite(n) ? n : fallback
    }
    const days = (v, fallback) => {
      const n = Number(v)
      return Number.isInteger(n) && n >= 0 ? n : fallback
    }
    await setSettings({
      returnPess: num(prefs.returnPess, 5),
      returnBase: num(prefs.returnBase, 7),
      returnOpt: num(prefs.returnOpt, 9),
      inflationRate: num(prefs.inflationRate, 2),
      dueSoonAmberDays: days(prefs.dueSoonAmberDays, 3),
      dueSoonTealDays: days(prefs.dueSoonTealDays, 7),
    })
    setPrefsNote('Saved.')
    setTimeout(() => setPrefsNote(''), 2000)
    await onChanged()
  }

  async function handleExportExcel() {
    setBusy(true)
    try {
      await exportAllWorkbook()
      setDataNote('Excel export downloaded.')
    } finally {
      setBusy(false)
    }
  }

  async function handleExportJson() {
    setBusy(true)
    try {
      await exportBackupFile()
      setLastBackupAt(Date.now())
      setDataNote('Backup downloaded.')
    } finally {
      setBusy(false)
    }
  }

  async function handleLoadSample() {
    setBusy(true)
    try {
      const seeded = await seedIfEmpty()
      setDataNote(seeded ? 'Sample data loaded.' : 'Not loaded: you already have data.')
      if (seeded) await onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function handleWipe() {
    setBusy(true)
    try {
      await wipeAllData()
      setWipeText('')
      setDataNote('All data erased.')
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  const expenseCats = categories.filter((c) => c.kind === 'expense')
  const incomeCats = categories.filter((c) => c.kind === 'income')

  async function submitAccount(data) {
    if (editor.item) await updateAccount(editor.item.id, data)
    else await addAccount(data)
    await onChanged()
    setEditor(null)
  }

  async function onDeleteAccount() {
    const res = await deleteAccount(editor.item.id)
    if (res.ok) {
      await onChanged()
      setEditor(null)
    }
    return res
  }

  async function submitCategory(data) {
    if (editor.item) await updateCategory(editor.item.id, data)
    else await addCategory(data)
    await onChanged()
    setEditor(null)
  }

  async function onDeleteCategory() {
    const res = await deleteCategory(editor.item.id)
    if (res.ok) {
      await onChanged()
      setEditor(null)
    }
    return res
  }

  const editing = editor?.item
  let title = 'Settings'
  if (editor?.type === 'account') title = editing ? 'Edit Account' : 'Add Account'
  if (editor?.type === 'category') title = editing ? 'Edit Category' : 'Add Category'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      aria-hidden={open ? undefined : 'true'}
      className={`fixed inset-0 z-50 mx-auto flex w-full max-w-[430px] flex-col bg-bg ${
        open ? 'overlay-open translate-x-0' : 'overlay-closed pointer-events-none translate-x-full'
      }`}
    >
      {/* Header */}
      <header className="safe-pt flex items-center gap-3 border-b border-hairline px-4 pb-4">
        <button
          onClick={() => (editor ? setEditor(null) : onClose())}
          aria-label="Back"
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold text-txt-primary">{title}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4">
        {editor ? (
          editor.type === 'account' ? (
            <AccountForm
              account={editor.item}
              onSubmit={submitAccount}
              onCancel={() => setEditor(null)}
              onDelete={editor.item ? onDeleteAccount : undefined}
            />
          ) : (
            <CategoryForm
              category={editor.item}
              onSubmit={submitCategory}
              onCancel={() => setEditor(null)}
              onDelete={editor.item ? onDeleteCategory : undefined}
            />
          )
        ) : (
          <>
            {/* Accounts */}
            <Section
              title="Accounts"
              actionLabel="Add Account"
              onAction={() => setEditor({ type: 'account', item: null })}
            >
              <div className="overflow-hidden rounded-card border border-hairline bg-card">
                {accounts.length === 0 && <Empty>No accounts yet.</Empty>}
                {accounts.map((a, i) => (
                  <Row
                    key={a.id}
                    divider={i > 0}
                    onClick={() => setEditor({ type: 'account', item: a })}
                    left={
                      <div>
                        <div className="font-medium text-txt-primary">{a.name}</div>
                        <div className="text-sm text-txt-secondary">
                          <span className="capitalize">{a.type}</span> · {formatAmount(a.startingBalance)}
                          {' · '}
                          {a.expectedAnnualReturn}% return
                        </div>
                      </div>
                    }
                  />
                ))}
              </div>
            </Section>

            {/* Categories */}
            <Section
              title="Categories"
              actionLabel="Add Category"
              onAction={() => setEditor({ type: 'category', item: null })}
            >
              <CategoryGroup label="Expense" items={expenseCats} onEdit={(c) => setEditor({ type: 'category', item: c })} />
              <CategoryGroup label="Income" items={incomeCats} onEdit={(c) => setEditor({ type: 'category', item: c })} />
            </Section>

            {/* Preferences */}
            {prefs && (
              <section className="mb-8">
                <h2 className="mb-3 text-base font-semibold text-txt-primary">Preferences</h2>
                <div className="rounded-card border border-hairline bg-card p-4">
                  <h3 className="mb-2 text-sm font-medium text-txt-secondary">
                    Forecast return assumptions (% p.a.)
                  </h3>
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    <PrefField
                      label="Pessimistic"
                      value={prefs.returnPess}
                      onChange={(v) => setPrefs((p) => ({ ...p, returnPess: v }))}
                    />
                    <PrefField
                      label="Base"
                      value={prefs.returnBase}
                      onChange={(v) => setPrefs((p) => ({ ...p, returnBase: v }))}
                    />
                    <PrefField
                      label="Optimistic"
                      value={prefs.returnOpt}
                      onChange={(v) => setPrefs((p) => ({ ...p, returnOpt: v }))}
                    />
                  </div>
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    <PrefField
                      label="Inflation %"
                      value={prefs.inflationRate}
                      onChange={(v) => setPrefs((p) => ({ ...p, inflationRate: v }))}
                    />
                    <PrefField
                      label="Amber ≤ days"
                      value={prefs.dueSoonAmberDays}
                      onChange={(v) => setPrefs((p) => ({ ...p, dueSoonAmberDays: v }))}
                    />
                    <PrefField
                      label="Teal ≤ days"
                      value={prefs.dueSoonTealDays}
                      onChange={(v) => setPrefs((p) => ({ ...p, dueSoonTealDays: v }))}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={savePrefs}
                      className="rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-black active:opacity-80"
                    >
                      Save preferences
                    </button>
                    {prefsNote && <span className="text-sm text-accent">{prefsNote}</span>}
                  </div>
                  <p className="mt-3 text-xs leading-snug text-txt-muted">
                    Returns scale the forecast bands; the badge thresholds control when reminders
                    show amber/teal "Due soon".
                  </p>
                </div>
              </section>
            )}

            {/* Data management */}
            <section className="mb-8">
              <h2 className="mb-3 text-base font-semibold text-txt-primary">Data</h2>
              <div className="overflow-hidden rounded-card border border-hairline bg-card">
                <DataRow
                  icon={FileSpreadsheet}
                  title="Export Excel (.xlsx)"
                  subtitle="Transactions, monthly summary, categories, accounts"
                  onClick={handleExportExcel}
                  disabled={busy}
                />
                <DataRow
                  icon={FileJson}
                  title="Export JSON backup"
                  subtitle={
                    lastBackupAt
                      ? `Last backup ${formatDate(lastBackupAt)}`
                      : 'Complete backup of everything'
                  }
                  onClick={handleExportJson}
                  disabled={busy}
                  divider
                />
                <DataRow
                  icon={Upload}
                  title="Restore JSON backup"
                  subtitle="Merge or replace, with preview"
                  onClick={() => setDataView('json')}
                  disabled={busy}
                  divider
                />
                <DataRow
                  icon={Upload}
                  title="Import from BlueCoins"
                  subtitle="CSV / XLSX with column mapping & preview"
                  onClick={() => setDataView('bluecoins')}
                  disabled={busy}
                  divider
                />
                <DataRow
                  icon={Sprout}
                  title="Load sample data"
                  subtitle="Only when the app is empty, wipe to remove"
                  onClick={handleLoadSample}
                  disabled={busy}
                  divider
                />
              </div>
              {dataNote && <p className="mt-2 px-1 text-sm text-accent">{dataNote}</p>}

              {/* Danger zone */}
              <div className="mt-4 rounded-card border border-expense/30 bg-card p-4">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-expense">
                  <Trash2 size={15} />
                  Erase all data
                </h3>
                <p className="mb-3 text-xs text-txt-muted">
                  Deletes every account, category, transaction, reminder and setting from this
                  device. There is no undo. Export a backup first.
                </p>
                <div className="flex gap-2">
                  <input
                    value={wipeText}
                    onChange={(e) => setWipeText(e.target.value)}
                    placeholder='Type "delete" to confirm'
                    aria-label="Type delete to confirm erasing all data"
                    className="min-w-0 flex-1 rounded-xl border border-hairline bg-elevated px-3 py-2 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none"
                  />
                  <button
                    onClick={handleWipe}
                    disabled={busy || wipeText.trim().toLowerCase() !== 'delete'}
                    className="rounded-xl bg-expense px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Erase
                  </button>
                </div>
              </div>
            </section>

            {/* About */}
            <section className="mb-8">
              <h2 className="mb-3 text-base font-semibold text-txt-primary">About</h2>
              <div className="rounded-card border border-hairline bg-card p-4 text-sm text-txt-secondary">
                <div className="mb-2 flex items-center gap-2.5">
                  <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" aria-hidden="true" className="h-7 w-7" />
                  <p className="font-medium text-txt-primary">greuro · grow your euros</p>
                </div>
                <p className="leading-snug">
                  Local-first personal budgeting. All data lives in this device's browser storage
                  (IndexedDB): no cloud, no account, no telemetry. Install it to use it like a
                  native app, full-screen and offline.
                </p>
                {/* Hides itself when already installed or when the browser can't. */}
                <InstallAppButton variant="inline" />
              </div>
            </section>
          </>
        )}
      </div>

      <ImportJson
        open={dataView === 'json'}
        onClose={() => setDataView(null)}
        onImported={onChanged}
      />
      <BlueCoinsImport
        open={dataView === 'bluecoins'}
        onClose={() => setDataView(null)}
        onImported={onChanged}
      />
    </div>
  )
}

function PrefField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-txt-muted">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-hairline bg-elevated px-3 py-2 text-sm text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
      />
    </label>
  )
}

function DataRow({ icon: Icon, title, subtitle, onClick, disabled, divider }) {
  return (
    <>
      {divider && <div className="mx-4 h-px bg-hairline" />}
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/[0.03] disabled:opacity-50"
      >
        <Icon size={18} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-txt-primary">{title}</span>
          <span className="block truncate text-xs text-txt-muted">{subtitle}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-txt-muted" />
      </button>
    </>
  )
}

function Section({ title, actionLabel, onAction, children }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-txt-primary">{title}</h2>
        <button
          onClick={onAction}
          className="flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/25"
        >
          <Plus size={16} />
          {actionLabel}
        </button>
      </div>
      {children}
    </section>
  )
}

function CategoryGroup({ label, items, onEdit }) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 px-1 text-sm font-medium text-txt-secondary">{label}</h3>
      <div className="overflow-hidden rounded-card border border-hairline bg-card">
        {items.length === 0 && <Empty>No {label.toLowerCase()} categories.</Empty>}
        {items.map((c, i) => (
          <Row
            key={c.id}
            divider={i > 0}
            onClick={() => onEdit(c)}
            left={
              <div className="flex items-center gap-3">
                <CategoryIcon name={c.icon} color={c.color} size={40} />
                <span className="font-medium text-txt-primary">{c.name}</span>
              </div>
            }
          />
        ))}
      </div>
    </div>
  )
}

function Row({ left, divider, onClick }) {
  return (
    <>
      {divider && <div className="mx-4 h-px bg-hairline" />}
      <button
        onClick={onClick}
        className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-white/[0.03]"
      >
        {left}
        <ChevronRight size={18} className="shrink-0 text-txt-muted" />
      </button>
    </>
  )
}

function Empty({ children }) {
  return <div className="px-4 py-6 text-center text-sm text-txt-muted">{children}</div>
}
