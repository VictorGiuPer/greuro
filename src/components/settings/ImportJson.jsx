import { useEffect, useState } from 'react'
import { ArrowLeft, FileJson, Check } from 'lucide-react'
import { validateBackup, applyBackup } from '../../db/backup'
import { formatDate } from '../../lib/format'

/**
 * JSON backup restore flow: pick file → validated preview (counts, source
 * date) → choose merge or replace → apply. Replace requires a second tap.
 * No writes happen before the final confirm.
 */
export default function ImportJson({ open, onClose, onImported }) {
  const [stage, setStage] = useState('pick') // pick | preview | done
  const [json, setJson] = useState(null)
  const [info, setInfo] = useState(null) // { counts, exportedAt }
  const [mode, setMode] = useState('merge')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open) return
    setStage('pick')
    setJson(null)
    setInfo(null)
    setMode('merge')
    setConfirmReplace(false)
    setError('')
    setResult(null)
  }, [open])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setError('')
    try {
      const parsed = JSON.parse(await file.text())
      const valid = validateBackup(parsed)
      if (!valid.ok) {
        setError(valid.error)
        return
      }
      setJson(parsed)
      setInfo(valid)
      setStage('preview')
    } catch {
      setError('Could not read that file as JSON.')
    }
  }

  async function handleApply() {
    if (mode === 'replace' && !confirmReplace) {
      setConfirmReplace(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      const imported = await applyBackup(json, mode)
      setResult(imported)
      setStage('done')
      await onImported?.()
    } catch (err) {
      setError(err.message || 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[60] mx-auto flex w-full max-w-[430px] flex-col bg-bg ${
        open ? 'overlay-open translate-x-0' : 'overlay-closed pointer-events-none translate-x-full'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Import JSON backup"
      aria-hidden={open ? undefined : 'true'}
    >
      <header className="safe-pt flex items-center gap-3 border-b border-hairline px-4 pb-4">
        <button
          onClick={onClose}
          aria-label="Back"
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold text-txt-primary">Restore Backup</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5">
        {stage === 'pick' && (
          <>
            <p className="mb-4 text-sm text-txt-secondary">
              Choose a <span className="text-txt-primary">budget-backup-….json</span> file exported
              from this app. You'll see a summary before anything is written.
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-card border border-dashed border-white/15 bg-card px-6 py-10 text-center">
              <FileJson size={32} className="text-accent" />
              <span className="font-medium text-txt-primary">Choose backup file</span>
              <span className="text-xs text-txt-muted">.json</span>
              <input type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
            </label>
            {error && <p className="mt-4 text-sm text-expense">{error}</p>}
          </>
        )}

        {stage === 'preview' && info && (
          <>
            <div className="mb-4 rounded-card border border-hairline bg-card p-4">
              <h2 className="mb-2 text-sm font-medium text-txt-secondary">This backup contains</h2>
              <ul className="space-y-1 text-sm text-txt-primary">
                <li>{info.counts.accounts} accounts</li>
                <li>{info.counts.categories} categories</li>
                <li>{info.counts.transactions} transactions</li>
                <li>{info.counts.scheduled} reminders</li>
              </ul>
              {info.exportedAt && (
                <p className="mt-2 text-xs text-txt-muted">
                  Exported {formatDate(new Date(info.exportedAt).getTime())}
                </p>
              )}
            </div>

            <h2 className="mb-2 text-sm font-medium text-txt-secondary">How to import</h2>
            <div className="mb-4 space-y-2">
              <ModeOption
                active={mode === 'merge'}
                onClick={() => {
                  setMode('merge')
                  setConfirmReplace(false)
                }}
                title="Merge into current data"
                desc="Reuses accounts/categories with matching names; adds all transactions and reminders. May duplicate rows if they were already imported."
              />
              <ModeOption
                active={mode === 'replace'}
                onClick={() => setMode('replace')}
                title="Replace everything"
                desc="Erases ALL current data first, then restores the backup exactly (lossless)."
                danger
              />
            </div>

            {error && <p className="mb-3 text-sm text-expense">{error}</p>}

            <button
              onClick={handleApply}
              disabled={busy}
              className={`w-full rounded-2xl py-3.5 font-semibold transition-colors disabled:opacity-50 ${
                mode === 'replace'
                  ? confirmReplace
                    ? 'bg-expense text-white'
                    : 'border border-expense bg-expense/10 text-expense'
                  : 'bg-accent text-black active:opacity-80'
              }`}
            >
              {mode === 'replace'
                ? confirmReplace
                  ? 'Tap again to erase & restore'
                  : 'Replace everything…'
                : 'Merge into my data'}
            </button>
          </>
        )}

        {stage === 'done' && result && (
          <div className="flex flex-col items-center pt-10 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
              <Check size={28} className="text-accent" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-txt-primary">Import complete</h2>
            <p className="mb-6 text-sm text-txt-secondary">
              {result.transactions} transactions, {result.accounts} new accounts,{' '}
              {result.categories} new categories, {result.scheduled} reminders.
            </p>
            <button
              onClick={onClose}
              className="rounded-2xl bg-accent px-8 py-3 font-semibold text-black active:opacity-80"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ModeOption({ active, onClick, title, desc, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-card border p-3.5 text-left transition-colors ${
        active
          ? danger
            ? 'border-expense/60 bg-expense/10'
            : 'border-accent/60 bg-accent/10'
          : 'border-hairline bg-card'
      }`}
    >
      <div className={`text-sm font-semibold ${danger && active ? 'text-expense' : 'text-txt-primary'}`}>
        {title}
      </div>
      <div className="mt-0.5 text-xs leading-snug text-txt-muted">{desc}</div>
    </button>
  )
}
