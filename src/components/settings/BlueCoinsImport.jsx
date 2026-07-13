import { useEffect, useState } from 'react'
import { ArrowLeft, FileSpreadsheet, Check } from 'lucide-react'
import {
  TARGET_FIELDS,
  autoDetectMapping,
  parseBlueCoinsRows,
  planBlueCoinsImport,
  commitBlueCoinsImport,
} from '../../db/bluecoins'
import { isSqliteFile, parseBlueCoinsSqlite } from '../../db/bluecoinsSqlite'
import { formatAmount, formatDate } from '../../lib/format'
import Select from '../ui/Select'

// sql.js (WASM SQLite) is loaded on demand; the wasm ships with the app so
// .fydb imports work fully offline.
async function loadSqlJs() {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ])
  return initSqlJs({ locateFile: () => wasmUrl })
}

/**
 * BlueCoins migration: pick CSV/XLSX → map columns (auto-detected) → preview
 * parsed rows + what will be created → commit. Nothing is written until the
 * preview is confirmed.
 */
export default function BlueCoinsImport({ open, onClose, onImported }) {
  const [stage, setStage] = useState('pick') // pick | map | preview | done
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [dateOrder, setDateOrder] = useState('DMY')
  const [parsed, setParsed] = useState([])
  const [skipped, setSkipped] = useState([])
  const [plan, setPlan] = useState(null)
  const [accountDefs, setAccountDefs] = useState(null) // .fydb path only
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setStage('pick')
    setHeaders([])
    setRows([])
    setMapping({})
    setDateOrder('DMY')
    setParsed([])
    setSkipped([])
    setPlan(null)
    setAccountDefs(null)
    setResult(null)
    setError('')
  }, [open])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)

      // BlueCoins backups (.fydb) are SQLite — fixed schema, no mapping step.
      if (isSqliteFile(bytes)) {
        const SQL = await loadSqlJs()
        const res = parseBlueCoinsSqlite(SQL, bytes)
        if (res.parsed.length === 0) {
          setError('No importable transactions found in this BlueCoins backup.')
          return
        }
        setParsed(res.parsed)
        setSkipped(res.skipped)
        setAccountDefs(res.accountDefs)
        setPlan(await planBlueCoinsImport(res.parsed, res.accountDefs))
        setStage('preview')
        return
      }

      const XLSX = (await import('xlsx')).default ?? (await import('xlsx'))
      const wb = XLSX.read(buffer, { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const headerRow = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] ?? []).map(String)
      const dataRows = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!headerRow.length || !dataRows.length) {
        setError('The file appears to be empty.')
        return
      }
      setHeaders(headerRow)
      setRows(dataRows)
      setMapping(autoDetectMapping(headerRow))
      setStage('map')
    } catch {
      setError('Could not read that file. Use a BlueCoins backup (.fydb) or a CSV/XLSX export.')
    } finally {
      setBusy(false)
    }
  }

  async function handleParse() {
    if (!mapping.date || !mapping.amount) {
      setError('Map at least the Date and Amount columns.')
      return
    }
    setError('')
    const res = parseBlueCoinsRows(rows, mapping, { dateOrder })
    if (res.parsed.length === 0) {
      setError('No importable rows found with this mapping.')
      return
    }
    setParsed(res.parsed)
    setSkipped(res.skipped)
    setPlan(await planBlueCoinsImport(res.parsed))
    setStage('preview')
  }

  async function handleCommit() {
    setBusy(true)
    setError('')
    try {
      const res = await commitBlueCoinsImport(parsed, accountDefs)
      setResult(res)
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
      aria-label="Import from BlueCoins"
      aria-hidden={open ? undefined : 'true'}
    >
      <header className="safe-pt flex items-center gap-3 border-b border-hairline px-4 pb-4">
        <button
          onClick={() => (stage === 'map' || stage === 'preview' ? setStage('pick') : onClose())}
          aria-label="Back"
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold text-txt-primary">BlueCoins Import</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5">
        {stage === 'pick' && (
          <>
            <p className="mb-4 text-sm text-txt-secondary">
              Use a BlueCoins <span className="text-txt-primary">backup file (.fydb)</span> from
              Settings → Data Management → Backup. It imports accounts with their opening
              balances automatically. CSV/XLSX exports work too (with a column-mapping step).
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-card border border-dashed border-white/15 bg-card px-6 py-10 text-center">
              <FileSpreadsheet size={32} className="text-accent" />
              <span className="font-medium text-txt-primary">Choose BlueCoins file</span>
              <span className="text-xs text-txt-muted">.fydb, .csv or .xlsx</span>
              <input
                type="file"
                accept=".fydb,.db,.sqlite,.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream"
                onChange={handleFile}
                className="hidden"
              />
            </label>
            {busy && <p className="mt-4 text-center text-sm text-txt-muted">Reading file…</p>}
            {error && <p className="mt-4 text-sm text-expense">{error}</p>}
          </>
        )}

        {stage === 'map' && (
          <>
            <p className="mb-4 text-sm text-txt-secondary">
              Match the file's columns to the app's fields. Common BlueCoins columns were detected
              automatically, adjust if needed.
            </p>
            <div className="space-y-3">
              {TARGET_FIELDS.map((f) => (
                <div key={f.id}>
                  <label className="mb-1 block text-sm text-txt-secondary">
                    {f.label}
                    {f.required && <span className="text-accent"> *</span>}
                  </label>
                  <Select
                    value={mapping[f.id] ?? ''}
                    onChange={(v) => setMapping((m) => ({ ...m, [f.id]: v || null }))}
                    placeholder="not in file"
                    options={headers.map((h) => ({ value: h, label: h }))}
                    ariaLabel={`Column for ${f.label}`}
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-sm text-txt-secondary">
                  Slash-date order (e.g. 03/07/2026)
                </label>
                <Select
                  value={dateOrder}
                  onChange={setDateOrder}
                  placeholder="Date order"
                  options={[
                    { value: 'DMY', label: 'Day / Month / Year' },
                    { value: 'MDY', label: 'Month / Day / Year' },
                  ]}
                  ariaLabel="Slash date order"
                />
              </div>
            </div>
            {error && <p className="mt-4 text-sm text-expense">{error}</p>}
            <button
              onClick={handleParse}
              className="mt-5 w-full rounded-2xl bg-accent py-3.5 font-semibold text-black active:opacity-80"
            >
              Preview import
            </button>
          </>
        )}

        {stage === 'preview' && plan && (
          <>
            <div className="mb-4 rounded-card border border-hairline bg-card p-4 text-sm">
              <p className="text-txt-primary">
                <span className="font-semibold text-accent">{parsed.length}</span> transactions
                ready to import
                {skipped.length > 0 && (
                  <span className="text-txt-muted"> · {skipped.length} rows skipped</span>
                )}
              </p>
              {plan.newAccounts.length > 0 && (
                <p className="mt-2 text-txt-secondary">
                  New accounts: <span className="text-txt-primary">{plan.newAccounts.join(', ')}</span>
                </p>
              )}
              {plan.newCategories.length > 0 && (
                <p className="mt-1 text-txt-secondary">
                  New categories:{' '}
                  <span className="text-txt-primary">{plan.newCategories.join(', ')}</span>
                </p>
              )}
              {skipped.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-txt-muted">
                  {skipped.slice(0, 5).map((s) => (
                    <li key={s.index}>
                      Row {s.index + 2}: {s.reason}
                    </li>
                  ))}
                  {skipped.length > 5 && <li>…and {skipped.length - 5} more</li>}
                </ul>
              )}
            </div>

            {/* Sample of parsed rows */}
            <div className="mb-4 overflow-hidden rounded-card border border-hairline bg-card">
              {parsed.slice(0, 8).map((t, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-hairline' : ''}`}
                >
                  <span className="w-20 shrink-0 text-xs tabular-nums text-txt-muted">
                    {formatDate(t.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-txt-primary">
                    {t.description ||
                      (t.type === 'transfer' ? `${t.fromAccount ?? '-'} → ${t.toAccount ?? '-'}` : '-')}
                  </span>
                  <span
                    className={`shrink-0 tabular-nums ${
                      t.type === 'expense'
                        ? 'text-expense'
                        : t.type === 'income'
                          ? 'text-income'
                          : 'text-txt-secondary'
                    }`}
                  >
                    {t.type === 'income' ? '+' : '-'}
                    {formatAmount(t.amount)}
                  </span>
                </div>
              ))}
              {parsed.length > 8 && (
                <div className="border-t border-hairline px-4 py-2 text-center text-xs text-txt-muted">
                  …and {parsed.length - 8} more
                </div>
              )}
            </div>

            {error && <p className="mb-3 text-sm text-expense">{error}</p>}

            <button
              onClick={handleCommit}
              disabled={busy}
              className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-black active:opacity-80 disabled:opacity-50"
            >
              {busy ? 'Importing…' : `Import ${parsed.length} transactions`}
            </button>
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
              {skipped.length > 0 ? `, ${skipped.length} rows skipped` : ''}.
            </p>
            <p className="mb-6 text-sm text-txt-muted">
              {result.accountsCreated} accounts and {result.categoriesCreated} categories were
              created. Adjust their colours & icons in Settings.
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
