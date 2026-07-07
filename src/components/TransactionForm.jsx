import { useEffect, useMemo, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
  addAccount,
  addCategory,
} from '../db'
import { toDateInputValue, fromDateInputValue, toAmountInputValue } from '../lib/format'
import { evaluate } from '../lib/calc'
import SegmentedPill from './SegmentedPill'
import Sheet from './ui/Sheet'
import Select from './ui/Select'
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
  }
}

export default function TransactionForm({
  open,
  onClose,
  onSaved,
  accounts,
  categories,
  editingTx,
  onMetaChanged,
}) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  // Inline quick-create: null | 'account' | 'from' | 'to' | 'category'
  const [mini, setMini] = useState(null)

  const isEdit = Boolean(editingTx)

  // (Re)initialize whenever the sheet opens or the edited row changes, and
  // focus the amount field so quick-add is type-ready immediately.
  useEffect(() => {
    if (!open) return
    setForm(editingTx ? formFromTx(editingTx) : emptyForm())
    setError('')
    setConfirmDelete(false)
    setMini(null)
    const t = setTimeout(() => document.getElementById('tx-amount')?.focus(), 80)
    return () => clearTimeout(t)
  }, [open, editingTx])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // Categories filtered to the kind matching the current type.
  const visibleCategories = useMemo(() => {
    if (form.type === 'transfer') return []
    return categories.filter((c) => c.kind === form.type)
  }, [categories, form.type])

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
      if (!form.categoryId) return 'Choose a category.'
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

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

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
                  autoFocus
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
                    options={accountOptions}
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
