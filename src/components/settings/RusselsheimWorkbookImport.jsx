import { useEffect, useState } from 'react'
import { ArrowLeft, Check, FileSpreadsheet } from 'lucide-react'
import {
  commitRusselsheimImport,
  detectRusselsheimWorkbook,
  parseRusselsheimWorkbook,
  planRusselsheimImport,
} from '../../db/russelsheimWorkbook'
import { formatAmount, formatDate } from '../../lib/format'

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function yearRange(layout, startYear) {
  const endYear = startYear + (layout.lastMonth < layout.firstMonth ? 1 : 0)
  return `${startYear}–${endYear}`
}

/**
 * Imports the recurring German monthly-budget workbook layout. The source
 * lacks dates and account data, so users confirm the calendar years before a
 * fully reversible preview is shown. Nothing changes until Import is pressed.
 */
export default function RusselsheimWorkbookImport({ open, onClose, onImported }) {
  const [stage, setStage] = useState('pick') // pick | years | preview | done
  const [workbook, setWorkbook] = useState(null)
  const [XLSX, setXLSX] = useState(null)
  const [layouts, setLayouts] = useState([])
  const [startYears, setStartYears] = useState({})
  const [parsed, setParsed] = useState([])
  const [skipped, setSkipped] = useState([])
  const [plan, setPlan] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setStage('pick')
    setWorkbook(null)
    setXLSX(null)
    setLayouts([])
    setStartYears({})
    setParsed([])
    setSkipped([])
    setPlan(null)
    setResult(null)
    setError('')
  }, [open])

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const module = await import('xlsx')
      const sheetJs = module.default ?? module
      const buffer = await file.arrayBuffer()
      const nextWorkbook = sheetJs.read(buffer, { cellFormula: true })
      const nextLayouts = detectRusselsheimWorkbook(sheetJs, nextWorkbook)
      setXLSX(sheetJs)
      setWorkbook(nextWorkbook)
      setLayouts(nextLayouts)
      setStartYears(Object.fromEntries(nextLayouts.map((layout) => [layout.sheetName, layout.defaultStartYear])))
      setStage('years')
    } catch (err) {
      setError(err.message || 'Could not read that workbook.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePreview() {
    if (!workbook || !XLSX) return
    setBusy(true)
    setError('')
    try {
      const extracted = parseRusselsheimWorkbook(XLSX, workbook, layouts, startYears)
      if (extracted.parsed.length === 0) {
        setError('No positive expense entries were found in the recognised sheets.')
        return
      }
      setParsed(extracted.parsed)
      setSkipped(extracted.skipped)
      setPlan(await planRusselsheimImport(extracted.parsed))
      setStage('preview')
    } catch (err) {
      setError(err.message || 'Could not prepare that import.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCommit() {
    setBusy(true)
    setError('')
    try {
      const nextResult = await commitRusselsheimImport(parsed)
      setResult(nextResult)
      setStage('done')
      await onImported?.()
    } catch (err) {
      setError(err.message || 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  const canCommit = plan && plan.ready.length > 0

  return (
    <div
      className={`fixed inset-0 z-[60] mx-auto flex w-full max-w-[430px] flex-col bg-bg ${
        open ? 'overlay-open translate-x-0' : 'overlay-closed pointer-events-none translate-x-full'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Import monthly budget workbook"
      aria-hidden={open ? undefined : 'true'}
    >
      <header className="safe-pt flex items-center gap-3 border-b border-hairline px-4 pb-4">
        <button
          onClick={() => (stage === 'years' || stage === 'preview' ? setStage('pick') : onClose())}
          aria-label="Back"
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold text-txt-primary">Monthly Budget Import</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5">
        {stage === 'pick' && (
          <>
            <p className="mb-4 text-sm text-txt-secondary">
              Import the German monthly-budget workbook layout. It recognises Miete, Einkaufen,
              Mensa and Rest entries across each yearly sheet. No data is changed until you confirm
              the preview.
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-card border border-dashed border-white/15 bg-card px-6 py-10 text-center">
              <FileSpreadsheet size={32} className="text-accent" />
              <span className="font-medium text-txt-primary">Choose workbook</span>
              <span className="text-xs text-txt-muted">.xlsx</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFile}
                className="hidden"
              />
            </label>
            {busy && <p className="mt-4 text-center text-sm text-txt-muted">Reading workbook…</p>}
            {error && <p className="mt-4 text-sm text-expense">{error}</p>}
          </>
        )}

        {stage === 'years' && (
          <>
            <p className="mb-4 text-sm text-txt-secondary">
              The workbook records months but not calendar years. Confirm the start year for each
              sheet; every transaction is dated on the first day of its listed month.
            </p>
            <div className="space-y-3">
              {layouts.map((layout) => {
                const value = Number(startYears[layout.sheetName]) || ''
                return (
                  <label key={layout.sheetName} className="block rounded-card border border-hairline bg-card p-4">
                    <span className="block font-medium text-txt-primary">{layout.sheetName}</span>
                    <span className="mt-0.5 block text-xs text-txt-muted">
                      Starts in {MONTH_LABELS[layout.firstMonth]}; currently {value ? yearRange(layout, value) : '—'}
                    </span>
                    <input
                      type="number"
                      min="1900"
                      max="2400"
                      value={value}
                      onChange={(event) =>
                        setStartYears((current) => ({
                          ...current,
                          [layout.sheetName]: event.target.value,
                        }))
                      }
                      aria-label={`Start year for ${layout.sheetName}`}
                      className="mt-3 w-full rounded-xl border border-hairline bg-elevated px-3 py-2 text-sm text-txt-primary focus:outline-none"
                    />
                  </label>
                )
              })}
            </div>
            {error && <p className="mt-4 text-sm text-expense">{error}</p>}
            <button
              onClick={handlePreview}
              disabled={busy}
              className="mt-5 w-full rounded-2xl bg-accent py-3.5 font-semibold text-black active:opacity-80 disabled:opacity-50"
            >
              {busy ? 'Preparing…' : 'Preview import'}
            </button>
          </>
        )}

        {stage === 'preview' && plan && (
          <>
            <div className="mb-4 rounded-card border border-hairline bg-card p-4 text-sm">
              <p className="text-txt-primary">
                <span className="font-semibold text-accent">{plan.ready.length}</span> transactions ready to import
                {plan.duplicates > 0 && <span className="text-txt-muted"> · {plan.duplicates} already imported</span>}
              </p>
              <p className="mt-1 text-txt-secondary">
                New historical spend: <span className="text-txt-primary">{formatAmount(plan.totalAmount)}</span>
              </p>
              <p className="mt-1 text-xs text-txt-muted">
                They use a dedicated balanced history account, so this import does not change your current balance.
              </p>
              {!plan.accountExists && (
                <p className="mt-2 text-txt-secondary">A historical spending account will be created.</p>
              )}
              {plan.newCategories.length > 0 && (
                <p className="mt-1 text-txt-secondary">
                  New categories: <span className="text-txt-primary">{plan.newCategories.join(', ')}</span>
                </p>
              )}
              {skipped.length > 0 && (
                <p className="mt-1 text-xs text-txt-muted">{skipped.length} unreadable amount cells will be skipped.</p>
              )}
            </div>

            <div className="mb-4 overflow-hidden rounded-card border border-hairline bg-card">
              {plan.ready.slice(0, 8).map((transaction) => (
                <div
                  key={transaction.sourceKey}
                  className="flex items-center gap-3 border-t border-hairline px-4 py-2.5 text-sm first:border-t-0"
                >
                  <span className="w-20 shrink-0 text-xs tabular-nums text-txt-muted">{formatDate(transaction.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-txt-primary">{transaction.description}</span>
                  <span className="shrink-0 tabular-nums text-expense">-{formatAmount(transaction.amount)}</span>
                </div>
              ))}
              {plan.ready.length > 8 && (
                <div className="border-t border-hairline px-4 py-2 text-center text-xs text-txt-muted">
                  …and {plan.ready.length - 8} more
                </div>
              )}
            </div>

            {error && <p className="mb-3 text-sm text-expense">{error}</p>}
            {canCommit ? (
              <button
                onClick={handleCommit}
                disabled={busy}
                className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-black active:opacity-80 disabled:opacity-50"
              >
                {busy ? 'Importing…' : `Import ${plan.ready.length} transactions`}
              </button>
            ) : (
              <p className="rounded-card border border-hairline bg-card p-4 text-center text-sm text-txt-secondary">
                Every recognised source cell has already been imported.
              </p>
            )}
          </>
        )}

        {stage === 'done' && result && (
          <div className="flex flex-col items-center pt-10 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
              <Check size={28} className="text-accent" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-txt-primary">Import complete</h2>
            <p className="mb-1 text-sm text-txt-secondary">
              {result.imported} transactions imported
              {result.duplicates > 0 ? `, ${result.duplicates} already imported` : ''}.
            </p>
            <p className="mb-6 text-sm text-txt-muted">
              {result.categoriesCreated} categories {result.categoriesCreated === 1 ? 'was' : 'were'} created.
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
