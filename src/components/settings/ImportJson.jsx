import { useEffect, useState } from 'react'
import { ArrowLeft, FileJson, Check } from 'lucide-react'
import { validateBackup, applyBackup } from '../../db/backup'
import { formatDate } from '../../lib/format'

/**
 * JSON backup restore flow: pick file → validated preview (counts, source
 * date) → replace the signed-in user's cloud budget with the backup.
 */
export default function ImportJson({ open, onClose, onImported }) {
  const [stage, setStage] = useState('pick') // pick | preview | done
  const [json, setJson] = useState(null)
  const [info, setInfo] = useState(null) // { counts, exportedAt }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open) return
    setStage('pick')
    setJson(null)
    setInfo(null)
    setError('')
    setResult(null)
  }, [open])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setError('')
    try {
      // Some mobile file providers add a UTF-8 BOM to otherwise valid JSON.
      // JSON.parse rejects that leading character, so remove it before parsing.
      const text = (await readFileText(file)).replace(/^\uFEFF/, '')
      const parsed = JSON.parse(text)
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
    setBusy(true)
    setError('')
    try {
      // Restore means restore: replace the cloud snapshot with the selected
      // backup so existing data cannot silently prevent/alter the import.
      const imported = await applyBackup(json, 'replace')
      await onImported?.()
      setResult(imported)
      setStage('done')
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
              Choose a <span className="text-txt-primary">budget-backup-….json</span> file. After
              you review it, the data will be saved to your signed-in Supabase account.
            </p>
            <div className="relative flex cursor-pointer flex-col items-center gap-3 rounded-card border border-dashed border-white/15 bg-card px-6 py-10 text-center">
              <FileJson size={32} className="text-accent" />
              <span className="font-medium text-txt-primary">Choose backup file</span>
              <span className="text-xs text-txt-muted">.json</span>
              <input
                type="file"
                accept=".json,application/json"
                aria-label="Choose JSON backup file"
                onChange={handleFile}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
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

            <div className="mb-4 rounded-card border border-expense/30 bg-expense/5 p-3.5">
              <h2 className="text-sm font-semibold text-expense">This replaces your cloud budget</h2>
              <p className="mt-1 text-xs leading-snug text-txt-secondary">
                The selected backup will overwrite all budget data for your signed-in account in Supabase. This cannot be undone.
              </p>
            </div>

            {error && <p className="mb-3 text-sm text-expense">{error}</p>}

            <button
              onClick={handleApply}
              disabled={busy}
              className="w-full rounded-2xl bg-expense py-3.5 font-semibold text-white transition-colors active:opacity-80 disabled:opacity-50"
            >
              {busy ? 'Saving backup to Supabase…' : 'Replace cloud data with this backup'}
            </button>
            {busy && (
              <p className="mt-3 text-center text-xs text-txt-muted" role="status" aria-live="polite">
                Saving the backup to your signed-in Supabase account. Keep this screen open.
              </p>
            )}
          </>
        )}

        {stage === 'done' && result && (
          <div className="flex flex-col items-center pt-10 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
              <Check size={28} className="text-accent" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-txt-primary">Backup saved to Supabase</h2>
            <p className="mb-6 text-sm text-txt-secondary">
              Saved {result.transactions} transactions, {result.accounts} accounts,{' '}
              {result.categories} categories, {result.scheduled} reminders to your cloud budget.
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

function readFileText(file) {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected file.'))
    reader.readAsText(file)
  })
}
