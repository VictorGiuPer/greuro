import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Trash2, ChevronDown } from 'lucide-react'
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
  addAccount,
  addCategory,
  getDescriptionSuggestions,
  accountUsage,
} from '../db'
import {
  toDateInputValue,
  fromDateInputValue,
  toAmountInputValue,
  parseAmountInput,
  formatAmount,
} from '../lib/format'
import { evaluate } from '../lib/calc'
import SegmentedPill from './SegmentedPill'
import Sheet from './ui/Sheet'
import Select from './ui/Select'
import Collapse from './ui/Collapse'
import AmountCalcInput from './AmountCalcInput'
import AccountForm from './settings/AccountForm'
import CategoryForm from './settings/CategoryForm'

const TYPES = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfer' },
]

function emptyForm() {
  return {
    type: 'expense',
    amount: '',
    date: toDateInputValue(Date.now()),
    description: '',
    categoryId: '',
    accountId: '',
    fromAccountId: '',
    toAccountId: '',
    tripId: '',
    reimbursable: false,
    owedAmount: '',
    paidBackNote: '',
    resolved: false,
  }
}

/** Build initial form state from an existing transaction (edit mode). */
function formFromTx(tx) {
  return {
    type: tx.type,
    amount: toAmountInputValue(tx.amount),
    date: toDateInputValue(tx.date),
    description: tx.description || '',
    categoryId: tx.categoryId ?? '',
    accountId: tx.accountId ?? '',
    fromAccountId: tx.fromAccountId ?? '',
    toAccountId: tx.toAccountId ?? '',
    tripId: tx.tripId ?? '',
    reimbursable: Boolean(tx.reimbursable),
    owedAmount: tx.owedAmount ? toAmountInputValue(tx.owedAmount) : '',
    paidBackNote: tx.paidBackNote || '',
    resolved: Boolean(tx.resolved),
  }
}

export default function TransactionForm({
  open,
  onClose,
  onSaved,
  accounts,
  categories,
  trips = [],
  editingTx,
  prefillAmount,
  onMetaChanged,
}) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  // Inline quick-create: null | 'account' | 'from' | 'to' | 'category'
  const [mini, setMini] = useState(null)
  // Autofill memory: recent distinct descriptions matching what's typed.
  const [suggestions, setSuggestions] = useState([])
  // The "Optional" disclosure (trip + paid-back) — collapsed unless in use.
  const [optionalOpen, setOptionalOpen] = useState(false)
  // Description value we last prefilled/loaded — suppresses re-suggesting it.
  const appliedDescRef = useRef('')

  const isEdit = Boolean(editingTx)
  // Balance corrections stay editable/deletable, but skip the category rule.
  const isAdjustment = Boolean(editingTx?.isAdjustment)

  // (Re)initialize whenever the sheet opens or the edited row changes. The
  // keyboard should only ever appear from an active tap on a field — never
  // automatically — so this deliberately does NOT focus anything.
  useEffect(() => {
    if (!open) return
    const base = editingTx ? formFromTx(editingTx) : emptyForm()
    // A new transaction can arrive with the amount pre-filled (Android
    // share/notification auto-fill). Only seeds the amount, nothing else.
    if (!editingTx && prefillAmount) base.amount = toAmountInputValue(prefillAmount)
    setForm(base)
    setError('')
    setConfirmDelete(false)
    setMini(null)
    setSuggestions([])
    // Auto-expand when the row already uses an optional tag, so it's visible.
    setOptionalOpen(Boolean(base.tripId) || Boolean(base.reimbursable))
    appliedDescRef.current = editingTx?.description || ''
  }, [open, editingTx, prefillAmount])

  // Debounced description-memory lookup: only while typing something new
  // (≥2 chars) that we didn't just prefill.
  useEffect(() => {
    if (!open || mini) return
    const desc = form.description.trim()
    if (desc.length < 2 || desc === appliedDescRef.current.trim()) {
      setSuggestions([])
      return
    }
    let active = true
    const t = setTimeout(async () => {
      const res = await getDescriptionSuggestions(desc, 4)
      if (active) setSuggestions(res)
    }, 150)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [form.description, open, mini])

  // Prefill everything except the amount from a remembered transaction.
  function applySuggestion(s) {
    appliedDescRef.current = s.description
    setSuggestions([])
    setForm((f) => ({
      ...f,
      description: s.description,
      type: s.type,
      categoryId: s.categoryId != null ? String(s.categoryId) : '',
      accountId: s.accountId != null ? String(s.accountId) : '',
      fromAccountId: s.fromAccountId != null ? String(s.fromAccountId) : '',
      toAccountId: s.toAccountId != null ? String(s.toAccountId) : '',
    }))
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // Categories filtered to the kind matching the current type.
  const visibleCategories = useMemo(() => {
    if (form.type === 'transfer') return []
    return categories.filter((c) => c.kind === form.type)
  }, [categories, form.type])

  // Amount + owed parsed once and reused by the summary, live preview and
  // the Resolved badge. Owed = the total you expect back, a fixed figure you
  // set (not a running "paid so far" tally) — netting only happens once
  // `resolved` is explicitly toggled.
  const amountValue = useMemo(() => evaluate(form.amount).value ?? 0, [form.amount])
  const owedValue = useMemo(() => parseAmountInput(form.owedAmount) || 0, [form.owedAmount])
  const netPreview = form.resolved ? Math.max(0, amountValue - owedValue) : amountValue

  function toggleResolved() {
    set({ resolved: !form.resolved })
  }

  // What the collapsed "Optional" header advertises, so a set tag is never
  // hidden behind a closed disclosure.
  const optionalSummary = useMemo(() => {
    const parts = []
    if (form.tripId) {
      const trip = trips.find((t) => t.id === Number(form.tripId))
      if (trip) parts.push(trip.name)
    }
    if (form.reimbursable) {
      parts.push(form.resolved ? 'Resolved' : `${formatAmount(owedValue)} owed`)
    }
    return parts.join(' · ')
  }, [form.tripId, form.reimbursable, form.resolved, owedValue, trips])

  // Trips offered in the (optional) trip tag: active ones + the currently
  // tagged trip even if archived (edit mode). Hidden entirely when empty.
  const tripChoices = useMemo(() => {
    const active = trips.filter((t) => !t.archived)
    const curId = Number(form.tripId)
    if (form.tripId && !active.some((t) => t.id === curId)) {
      const cur = trips.find((t) => t.id === curId)
      if (cur) return [cur, ...active]
    }
    return active
  }, [trips, form.tripId])

  function changeType(type) {
    setError('')
    setForm((f) => {
      const next = { ...f, type }
      if (type === 'transfer') {
        next.categoryId = ''
      } else if (f.categoryId) {
        const still = categories.find((c) => c.id === Number(f.categoryId) && c.kind === type)
        if (!still) next.categoryId = ''
      }
      return next
    })
  }

  function validate() {
    const res = evaluate(form.amount)
    if (res.incomplete) return 'Enter an amount greater than 0.'
    if (res.error) return 'The amount calculation is invalid.'
    if (res.value <= 0) return 'Enter an amount greater than 0.'
    if (!form.date) return 'Pick a date.'
    if (form.type === 'transfer') {
      if (!form.fromAccountId) return 'Choose a "From" account.'
      if (!form.toAccountId) return 'Choose a "To" account.'
      if (Number(form.fromAccountId) === Number(form.toAccountId))
        return '"From" and "To" must be different accounts.'
    } else {
      if (!form.accountId) return 'Choose an account.'
      // Balance adjustments carry no category by design — don't demand one.
      if (!form.categoryId && !isAdjustment) return 'Choose a category.'
    }
    if (form.type === 'expense' && form.reimbursable && form.owedAmount.trim()) {
      const owed = parseAmountInput(form.owedAmount)
      if (!Number.isFinite(owed) || owed < 0) return 'Enter a valid amount to be paid back.'
      if (owed > res.value) return 'Amount to be paid back can’t exceed the total.'
    }
    return ''
  }

  async function handleSave() {
    const msg = validate()
    if (msg) {
      setError(msg)
      return
    }
    setSaving(true)
    const payload = {
      type: form.type,
      // Commit the evaluated calculator result (validate() guaranteed it).
      amount: evaluate(form.amount).value,
      date: fromDateInputValue(form.date),
      description: form.description,
      categoryId: form.type === 'transfer' ? null : Number(form.categoryId),
      accountId: form.type === 'transfer' ? null : Number(form.accountId),
      fromAccountId: form.type === 'transfer' ? Number(form.fromAccountId) : null,
      toAccountId: form.type === 'transfer' ? Number(form.toAccountId) : null,
      tripId: form.type === 'transfer' || !form.tripId ? null : Number(form.tripId),
      // Paid-back tag (normalize() drops these for non-expenses).
      reimbursable: form.type === 'expense' && form.reimbursable ? 1 : 0,
      owedAmount: form.owedAmount.trim() ? parseAmountInput(form.owedAmount) || 0 : 0,
      paidBackNote: form.paidBackNote,
      resolved: form.reimbursable && form.resolved ? 1 : 0,
      // Preserve the adjustment flag across edits.
      isAdjustment: isAdjustment ? 1 : 0,
    }
    try {
      if (isEdit) await updateTransaction(editingTx.id, payload)
      else await addTransaction(payload)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    try {
      await deleteTransaction(editingTx.id)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  // ----- inline quick-create handlers -----
  async function createAccount(data) {
    const id = await addAccount(data)
    if (onMetaChanged) await onMetaChanged()
    if (mini === 'from') set({ fromAccountId: String(id) })
    else if (mini === 'to') set({ toAccountId: String(id) })
    else set({ accountId: String(id) })
    setMini(null)
  }

  async function createCategory(data) {
    const id = await addCategory(data)
    if (onMetaChanged) await onMetaChanged()
    set({ categoryId: String(id) })
    setMini(null)
  }

  // Transfers can use any account; expense/income only "active use" accounts
  // (plus the currently-selected one in edit mode, so an old row still works).
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const selectedAccountId = Number(form.accountId)
  const activeAccountOptions = accounts
    .filter((a) => accountUsage(a) === 'active' || a.id === selectedAccountId)
    .map((a) => ({ value: a.id, label: a.name }))

  const miniTitle =
    mini === 'category' ? 'Add Category' : mini ? 'Add Account' : null

  return (
    <Sheet open={open} onClose={onClose} label={isEdit ? 'Edit transaction' : 'New transaction'}>
      {mini ? (
            // ---- Inline quick-create sub-form ----
            <>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-txt-primary">{miniTitle}</h2>
                <button
                  onClick={() => setMini(null)}
                  className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              {mini === 'category' ? (
                <CategoryForm
                  defaultKind={form.type === 'transfer' ? 'expense' : form.type}
                  onSubmit={createCategory}
                  onCancel={() => setMini(null)}
                />
              ) : (
                <AccountForm onSubmit={createAccount} onCancel={() => setMini(null)} />
              )}
            </>
          ) : (
            // ---- Main transaction form ----
            <>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-txt-primary">
                  {isEdit ? 'Edit Transaction' : 'New Transaction'}
                </h2>
                <button
                  onClick={onClose}
                  className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Type segmented control */}
              <div className="mb-5">
                <SegmentedPill value={form.type} onChange={changeType} options={TYPES} />
              </div>

              {/* Amount — calculator field (e.g. "12,50 + 3,20 - 1") */}
              <div className="mb-5">
                <label htmlFor="tx-amount" className="mb-1.5 block text-sm text-txt-secondary">
                  Amount
                </label>
                <AmountCalcInput
                  id="tx-amount"
                  value={form.amount}
                  onChange={(v) => set({ amount: v })}
                />
              </div>

              {/* Date */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm text-txt-secondary">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set({ date: e.target.value })}
                  className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm text-txt-secondary">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => set({ description: e.target.value })}
                  placeholder={form.type === 'transfer' ? 'Optional' : 'Merchant or name'}
                  className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
                {/* Autofill suggestions from past transactions */}
                {suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {suggestions.map((s) => {
                      const acctId =
                        s.type === 'transfer' ? s.fromAccountId : s.accountId
                      const acct = accounts.find((a) => a.id === acctId)?.name
                      const cat = categories.find((c) => c.id === s.categoryId)?.name
                      const hint = [cat, acct].filter(Boolean).join(' · ')
                      return (
                        <button
                          key={s.description}
                          type="button"
                          onClick={() => applySuggestion(s)}
                          className="flex max-w-full items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-left text-xs text-accent"
                        >
                          <span className="font-medium">{s.description}</span>
                          {hint && <span className="truncate text-accent/60">{hint}</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Account(s) */}
              {form.type === 'transfer' ? (
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm text-txt-secondary">From</label>
                    <Select
                      value={form.fromAccountId}
                      onChange={(v) => set({ fromAccountId: v })}
                      placeholder="Account"
                      options={accountOptions}
                      onAddNew={() => setMini('from')}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm text-txt-secondary">To</label>
                    <Select
                      value={form.toAccountId}
                      onChange={(v) => set({ toAccountId: v })}
                      placeholder="Account"
                      options={accountOptions}
                      onAddNew={() => setMini('to')}
                    />
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm text-txt-secondary">Account</label>
                  <Select
                    value={form.accountId}
                    onChange={(v) => set({ accountId: v })}
                    placeholder="Choose account"
                    options={activeAccountOptions}
                    onAddNew={() => setMini('account')}
                  />
                </div>
              )}

              {/* Category (expense / income only) */}
              {form.type !== 'transfer' && (
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm text-txt-secondary">Category</label>
                  <Select
                    value={form.categoryId}
                    onChange={(v) => set({ categoryId: v })}
                    placeholder="Choose category"
                    options={visibleCategories.map((c) => ({ value: c.id, label: c.name }))}
                    onAddNew={() => setMini('category')}
                  />
                </div>
              )}

              {/* Optional tags (trip + paid back) — collapsed unless in use */}
              {form.type === 'expense' && (
                <div className="mb-4 overflow-hidden rounded-2xl border border-hairline bg-elevated">
                  <button
                    type="button"
                    onClick={() => setOptionalOpen((v) => !v)}
                    aria-expanded={optionalOpen}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-txt-secondary">Optional</span>
                      {optionalSummary && (
                        <span className="block truncate text-xs text-accent">
                          {optionalSummary}
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-txt-muted transition-transform ${
                        optionalOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <Collapse open={optionalOpen}>
                    <div className="border-t border-hairline px-4 pb-4 pt-3">
                      {/* Trip tag (only once you have trips) */}
                      {tripChoices.length > 0 && (
                        <div className="mb-4">
                          <label
                            htmlFor="tx-trip"
                            className="mb-1.5 block text-sm text-txt-secondary"
                          >
                            Trip
                          </label>
                          <select
                            id="tx-trip"
                            value={
                              form.tripId === '' || form.tripId == null ? '' : String(form.tripId)
                            }
                            onChange={(e) => set({ tripId: e.target.value })}
                            className="w-full appearance-none rounded-2xl border border-hairline bg-card px-4 py-3 text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
                            style={{
                              backgroundImage:
                                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239BA1AC' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'right 14px center',
                            }}
                          >
                            <option value="">No trip</option>
                            {tripChoices.map((t) => (
                              <option key={t.id} value={String(t.id)}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Needs to be paid back */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.reimbursable}
                        onClick={() => set({ reimbursable: !form.reimbursable })}
                        className="flex w-full items-center justify-between rounded-2xl border border-hairline bg-card px-4 py-3"
                      >
                        <span className="text-left text-sm text-txt-primary">
                          Needs to be paid back
                        </span>
                        <span
                          className={`ml-3 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
                            form.reimbursable ? 'bg-accent' : 'bg-white/10'
                          }`}
                        >
                          <span
                            className={`h-5 w-5 rounded-full bg-white transition-transform ${
                              form.reimbursable ? 'translate-x-5' : ''
                            }`}
                          />
                        </span>
                      </button>

                      <Collapse open={form.reimbursable}>
                        <div className="mt-3 space-y-3">
                          <div>
                            <label
                              htmlFor="tx-owed-amount"
                              className="mb-1.5 block text-sm text-txt-secondary"
                            >
                              To be paid back
                            </label>
                            <div className="flex items-center gap-2">
                              <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-hairline bg-card px-4">
                                <input
                                  id="tx-owed-amount"
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  value={form.owedAmount}
                                  onChange={(e) => set({ owedAmount: e.target.value })}
                                  placeholder="0,00"
                                  className="w-full min-w-0 bg-transparent py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none"
                                />
                                <span className="text-lg text-txt-muted">€</span>
                              </div>
                              <button
                                type="button"
                                onClick={toggleResolved}
                                aria-pressed={form.resolved}
                                className={`shrink-0 rounded-2xl border px-3.5 py-3 text-sm font-semibold transition-colors ${
                                  form.resolved
                                    ? 'border-accent/60 bg-accent/15 text-accent'
                                    : 'border-hairline bg-card text-txt-secondary hover:text-txt-primary'
                                }`}
                              >
                                Resolved
                              </button>
                            </div>
                          </div>
                          <div>
                            <label
                              htmlFor="tx-paidback-note"
                              className="mb-1.5 block text-sm text-txt-secondary"
                            >
                              Who / note
                            </label>
                            <input
                              id="tx-paidback-note"
                              type="text"
                              value={form.paidBackNote}
                              onChange={(e) => set({ paidBackNote: e.target.value })}
                              placeholder="e.g. Marc, work expenses"
                              className="w-full rounded-2xl border border-hairline bg-card px-4 py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                            />
                          </div>
                          <p className="text-xs leading-snug text-txt-muted">
                            {form.resolved
                              ? `Resolved — counts as ${formatAmount(netPreview)} now that ${formatAmount(owedValue)} came back.`
                              : `Counts as the full ${formatAmount(amountValue)} until you mark it resolved.`}
                          </p>
                        </div>
                      </Collapse>
                    </div>
                  </Collapse>
                </div>
              )}

              {error && <p className="mb-3 text-sm text-expense">{error}</p>}

              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-2 w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-black transition-opacity active:opacity-80 disabled:opacity-50"
              >
                {isEdit ? 'Save Changes' : 'Add Transaction'}
              </button>

              {isEdit && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-base font-semibold transition-colors ${
                    confirmDelete
                      ? 'border-expense bg-expense/10 text-expense'
                      : 'border-hairline text-txt-secondary hover:text-expense'
                  }`}
                >
                  <Trash2 size={18} />
                  {confirmDelete ? 'Tap again to confirm delete' : 'Delete'}
                </button>
              )}
            </>
          )}
    </Sheet>
  )
}
