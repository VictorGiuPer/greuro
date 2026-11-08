import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, HandCoins } from 'lucide-react'
import {
  getOwedTransactions, getAccounts, getCategories, getActiveTrips,
  resolveOwedTransactions, undoOwedResolution,
} from '../db'
import { groupOwedTransactions } from '../lib/owed'
import { outstandingAmount } from '../lib/txAmount'
import { formatAmount, formatDate } from '../lib/format'
import Collapse from '../components/ui/Collapse'
import TransactionForm from '../components/TransactionForm'

export default function Owed() {
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [trips, setTrips] = useState([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [undo, setUndo] = useState(null)
  const [editingTx, setEditingTx] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const load = useCallback(async () => {
    const [entries, accs, cats, tps] = await Promise.all([
      getOwedTransactions(), getAccounts(), getCategories(), getActiveTrips(),
    ])
    setRows(entries)
    setAccounts(accs)
    setCategories(cats)
    setTrips(tps)
    setReady(true)
  }, [])

  useEffect(() => { load().catch((e) => setError(e.message || 'Could not load owed entries.')) }, [load])

  const groups = useMemo(() => groupOwedTransactions(rows), [rows])
  const pending = groups.filter((g) => g.outstanding > 0)
  const total = groups.reduce((sum, g) => sum + g.outstandingCents, 0) / 100

  async function resolve(entries) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      const changes = await resolveOwedTransactions(entries.map((t) => t.id))
      if (changes.length) setUndo(changes)
      await load()
    } catch (e) {
      setError(e.message || 'Could not resolve these entries. Please try again.')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  async function handleUndo() {
    if (locked.current || !undo) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      await undoOwedResolution(undo)
      setUndo(null)
      await load()
    } catch (e) {
      setError(e.message || 'Could not undo. Please try again.')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  async function handleSaved() {
    setEditingTx(null)
    setUndo(null)
    try { await load() } catch (e) { setError(e.message || 'Could not refresh owed entries.') }
  }

  return (
    <div className="relative min-h-dvh pb-24">
      <header className="safe-pt sticky top-0 z-30 flex min-h-[70px] items-center bg-bg/90 px-4 pb-2 backdrop-blur">
        <h1 className="text-2xl font-semibold text-txt-primary">Owed to you</h1>
      </header>

      {error && <div role="alert" className="mx-3 mt-3 rounded-2xl border border-expense/40 bg-expense/10 p-4 text-sm text-expense">
        {error}
        {!ready && <button type="button" onClick={() => { setError(''); load().catch((e) => setError(e.message)) }} className="ml-2 min-h-[44px] underline">Retry</button>}
      </div>}

      {undo && <div role="status" className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent">
        <span>{undo.length} {undo.length === 1 ? 'entry' : 'entries'} resolved</span>
        <button type="button" disabled={busy} onClick={handleUndo} className="min-h-[44px] px-2 font-semibold disabled:opacity-50">Undo</button>
      </div>}

      {!ready && !error && <p role="status" className="p-6 text-sm text-txt-secondary">Loading owed entries…</p>}
      {ready && <>
        <div className="mx-3 mt-3 rounded-card border border-hairline bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-txt-secondary"><HandCoins size={18} />Total outstanding</div>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-accent">{formatAmount(total)}</p>
          <p className="mt-1 text-xs text-txt-muted">{pending.length} {pending.length === 1 ? 'person / group' : 'people / groups'}</p>
        </div>

        {pending.length === 0 && <div className="px-6 py-10 text-center text-txt-secondary">
          <p className="mb-1 font-medium text-txt-primary">Nothing outstanding</p>
          <p className="text-sm">Mark an expense “Needs to be paid back” to track it here.</p>
        </div>}

        <div className="mx-3 mt-3 space-y-3">
          {pending.map((group) => <OwedGroup key={group.key} group={group} busy={busy} onResolve={resolve} onEdit={setEditingTx} />)}
        </div>

        <section className="mx-3 mt-6 overflow-hidden rounded-card border border-hairline bg-card">
          <button type="button" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen} aria-controls="owed-history"
            className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-txt-primary">
            Owed history
            <ChevronDown size={18} className={`shrink-0 transition-transform duration-300 ${historyOpen ? 'rotate-180' : ''}`} />
          </button>
          <Collapse open={historyOpen}>
            <div id="owed-history" className="space-y-3 border-t border-hairline p-3">
              <p className="text-xs text-txt-muted">All outstanding and resolved entries, by original transaction date.</p>
              {groups.length === 0 && <p className="py-4 text-sm text-txt-secondary">No owed history yet.</p>}
              {groups.map((group) => <OwedGroup key={group.key} group={group} history busy={busy} onResolve={resolve} onEdit={setEditingTx} />)}
            </div>
          </Collapse>
        </section>
      </>}

      <TransactionForm open={Boolean(editingTx)} editingTx={editingTx}
        onClose={() => setEditingTx(null)} onSaved={handleSaved}
        accounts={accounts} categories={categories} trips={trips} onMetaChanged={load} />
    </div>
  )
}

function OwedGroup({ group, history = false, busy, onResolve, onEdit }) {
  const [open, setOpen] = useState(false)
  const id = `${history ? 'history' : 'pending'}-owed-${group.key ? `name-${encodeURIComponent(group.key)}` : 'unspecified'}`
  const entries = history ? group.transactions : group.transactions.filter((t) => outstandingAmount(t) > 0)

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-card">
      <div className="flex items-center gap-1 px-2">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
          className="flex min-h-[72px] min-w-0 flex-1 items-center gap-2 px-2 py-3 text-left">
          <ChevronDown size={18} className={`shrink-0 text-txt-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium text-txt-primary">{group.name}</p>
            <p className="text-xs text-txt-muted">{entries.length} {entries.length === 1 ? 'transaction' : 'transactions'}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-txt-primary">{formatAmount(history ? group.total : group.outstanding)}</span>
        </button>
        {!history && <button type="button" disabled={busy} onClick={() => onResolve(entries)} aria-label={`Resolve all owed by ${group.name}`}
          className="min-h-[44px] shrink-0 rounded-xl bg-accent/10 px-2 text-xs font-semibold text-accent disabled:opacity-50">Resolve all</button>}
      </div>
      {history && <p className="px-4 pb-3 text-xs leading-relaxed text-txt-secondary">
        Lifetime {formatAmount(group.total)} · Outstanding {formatAmount(group.outstanding)} · Resolved {formatAmount(group.resolved)}
      </p>}
      <Collapse open={open}>
        <div id={id} className="border-t border-hairline">
          {entries.map((tx) => <div key={tx.id} className="flex items-center gap-2 border-b border-hairline px-3 last:border-b-0">
            <button type="button" disabled={busy} onClick={() => onEdit(tx)} aria-label={`Open transaction ${tx.description || 'Expense'}`}
              className="min-h-[72px] min-w-0 flex-1 py-3 text-left disabled:opacity-50">
              <p className="break-words text-sm font-medium text-txt-primary">{tx.description || 'Expense'}</p>
              <p className="mt-1 text-xs text-txt-muted">{formatDate(tx.date)} · {formatAmount(tx.owedAmount)} owed</p>
              {history && <p className={`mt-1 text-xs ${tx.resolved ? 'text-accent' : 'text-txt-secondary'}`}>{tx.resolved ? 'Resolved' : 'Outstanding'}</p>}
            </button>
            {outstandingAmount(tx) > 0 && <button type="button" disabled={busy} onClick={() => onResolve([tx])}
              aria-label={`Resolve ${tx.description || 'expense'} owed by ${group.name}`}
              className="min-h-[44px] shrink-0 rounded-xl border border-accent/30 px-3 text-xs font-semibold text-accent disabled:opacity-50">Resolve</button>}
          </div>)}
        </div>
      </Collapse>
    </div>
  )
}
