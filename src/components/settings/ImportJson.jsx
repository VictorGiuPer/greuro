import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, FileJson, Check } from 'lucide-react'
import { validateBackup, applyBackup } from '../../db/backup'
import { formatDate } from '../../lib/format'
import { hasPendingJsonRestore, setPendingJsonRestore } from '../../lib/restoreIntent'

/**
 * JSON backup restore flow: choose file → validate → replace the signed-in
 * user's cloud budget and show the saved result.
 */
export default function ImportJson({ open, onClose, onImported }) {
  const [stage, setStage] = useState('pick') // pick | preview | uploading | done
  const [json, setJson] = useState(null)
  const [info, setInfo] = useState(null) // { counts, exportedAt }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [pickerPending, setPickerPending] = useState(false)
  const [resumedPicker, setResumedPicker] = useState(() => hasPendingJsonRestore())
  const inputRef = useRef(null)
  const processingRef = useRef(false)
  const pickerWatchRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setStage('pick')
    setJson(null)
    setInfo(null)
    setError('')
    setResult(null)
    setPickerPending(false)
    setResumedPicker(hasPendingJsonRestore())
  }, [open])

  async function handleFile(e) {
    const input = inputRef.current
    const file = input.files?.[0]
    if (!file) return
    if (processingRef.current) return
    stopPickerWatch()
    processingRef.current = true
    setPickerPending(false)
    setResumedPicker(false)
    setStage('reading')
    setError('')
    try {
      // Some mobile file providers add a UTF-8 BOM to otherwise valid JSON.
      // JSON.parse rejects that leading character, so remove it before parsing.
      const text = (await readFileText(file)).replace(/^\uFEFF/, '')
      // Reset only after reading; some mobile file pickers invalidate a file
      // handle if the input is cleared while the read is still in progress.
      input.value = ''
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch (parseError) {
        throw new Error(`The selected file is not valid JSON. ${parseError.message}`)
      }
      const valid = validateBackup(parsed)
      if (!valid.ok) {
        setPendingJsonRestore(false)
        setStage('pick')
        setError(valid.error)
        return
      }
      setJson(parsed)
      setInfo(valid)
      // Choosing a valid backup is the import action. Start the cloud write
      // immediately so there is no hidden follow-up tap on mobile.
      setStage('uploading')
      await saveBackup(parsed)
    } catch (err) {
      input.value = ''
      setPendingJsonRestore(false)
      setStage('pick')
      setError(`Could not read this JSON file: ${err?.message || 'unknown file error'}`)
    } finally {
      processingRef.current = false
    }
  }

  async function handleApply() {
    if (!json) return
    setStage('uploading')
    await saveBackup(json)
  }

  async function saveBackup(backup) {
    setBusy(true)
    setError('')
    try {
      // Restore means restore: replace the cloud snapshot with the selected
      // backup so existing data cannot silently prevent/alter the import.
      const imported = await applyBackup(backup, 'replace')
      setResult(imported)
      setStage('done')
      setPendingJsonRestore(false)
      try {
        await onImported?.()
      } catch (refreshError) {
        console.error('Backup was saved, but the screen could not refresh:', refreshError)
      }
    } catch (err) {
      setStage('preview')
      setError(err.message || 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  function closeImport() {
    setPendingJsonRestore(false)
    onClose?.()
  }

  function openFilePicker() {
    const input = inputRef.current
    if (!input || busy) return
    stopPickerWatch()
    input.value = ''
    setError('')
    setPickerPending(true)
    setPendingJsonRestore(true)
    let leftApp = false
    let checkScheduled = false
    let returnTimer = null
    const markLeftApp = () => { leftApp = true }
    const returnedToApp = () => {
      if (!leftApp || checkScheduled) return
      checkScheduled = true
      returnTimer = window.setTimeout(() => {
        if (input.files?.[0]) {
          void handleFile({ currentTarget: input })
        } else {
          stopPickerWatch()
          setPickerPending(false)
          setPendingJsonRestore(false)
          setError('Android returned without a file. Tap “Choose backup file” and select the JSON backup again.')
        }
      }, 350)
    }
    window.addEventListener('blur', markLeftApp)
    window.addEventListener('focus', returnedToApp)
    const onVisibilityChange = () => {
      if (document.hidden) markLeftApp()
      else returnedToApp()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    pickerWatchRef.current = () => {
      if (returnTimer != null) window.clearTimeout(returnTimer)
      window.removeEventListener('blur', markLeftApp)
      window.removeEventListener('focus', returnedToApp)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    input.click()
  }

  function stopPickerWatch() {
    pickerWatchRef.current?.()
    pickerWatchRef.current = null
  }

  if (typeof document === 'undefined') return null
  return createPortal((
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
          onClick={closeImport}
          aria-label="Back"
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold text-txt-primary">Restore Backup</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5">
        {(stage === 'pick' || stage === 'reading') && (
          <>
            <p className="mb-4 text-sm text-txt-secondary">
              Choose a <span className="text-txt-primary">budget-backup-….json</span> file. It
              will replace the data in your signed-in Supabase account.
            </p>
            <div className="mb-4 rounded-card border border-expense/30 bg-expense/5 p-3.5">
              <p className="text-xs leading-snug text-txt-secondary">
                Choosing a valid backup immediately replaces your entire cloud budget. This cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={openFilePicker}
              disabled={busy || stage === 'reading'}
              className="flex w-full flex-col items-center gap-3 rounded-card border border-dashed border-white/15 bg-card px-6 py-10 text-center disabled:opacity-60"
            >
              <FileJson size={32} className="text-accent" />
              <span className="font-medium text-txt-primary">
                {stage === 'reading' ? 'Reading backup file…' : 'Choose backup file'}
              </span>
              <span className="text-xs text-txt-muted">.json</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              aria-label="Choose JSON backup file"
              onChange={handleFile}
              className="sr-only"
            />
            {pickerPending && stage !== 'reading' && (
              <p className="mt-4 text-sm text-txt-secondary" role="status">
                Waiting for the file picker. If it closed without returning a file, tap “Choose backup file” to retry.
              </p>
            )}
            {resumedPicker && !error && (
              <p className="mt-4 text-sm text-txt-secondary" role="status">
                Android reopened Greuro while the file picker was open. Your budget has not changed; choose the backup file again to continue.
              </p>
            )}
            {error && <p className="mt-4 text-sm text-expense">{error}</p>}
          </>
        )}

        {(stage === 'preview' || stage === 'uploading') && info && (
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
              <p className="mt-1 text-xs leading-snug text-txt-secondary">The selected backup overwrites all budget data for this signed-in account.</p>
            </div>

            {error && <p className="mb-3 text-sm text-expense">{error}</p>}

            {stage === 'preview' && (
              <button
                onClick={handleApply}
                disabled={busy}
                className="w-full rounded-2xl bg-expense py-3.5 font-semibold text-white transition-colors active:opacity-80 disabled:opacity-50"
              >
                Retry saving backup to Supabase
              </button>
            )}
            {stage === 'uploading' && (
              <p className="mt-3 text-center text-xs text-txt-muted" role="status" aria-live="polite">
                {busy ? 'Saving the backup to Supabase… Keep this screen open.' : 'Preparing upload…'}
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
              onClick={closeImport}
              className="rounded-2xl bg-accent px-8 py-3 font-semibold text-black active:opacity-80"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  ), document.body)
}

async function readFileText(file) {
  if (typeof file.text === 'function') {
    try {
      return await file.text()
    } catch {
      // Retry through FileReader for Android document providers that reject
      // File.text() despite exposing the method.
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected file.'))
    reader.readAsText(file)
  })
}
