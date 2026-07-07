import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import SegmentedPill from '../SegmentedPill'
import CategoryIcon from '../CategoryIcon'
import { getIcon, ICON_CHOICES, COLOR_CHOICES } from '../../lib/icons'

const HEX_RE = /^#([0-9a-fA-F]{6})$/

/**
 * Add / edit form for a category: name, kind pill, color picker (preset
 * swatches + freeform hex), icon grid, and a live-preview tinted tile.
 *
 * @param category    existing category (edit) or null (add)
 * @param defaultKind seed the kind pill (used by the in-form quick-add)
 * @param onSubmit    async (data) => void
 * @param onCancel    () => void
 * @param onDelete    async () => ({ ok } | { ok:false, count })  (edit only)
 */
export default function CategoryForm({ category, defaultKind = 'expense', onSubmit, onCancel, onDelete }) {
  const isEdit = Boolean(category)
  const [name, setName] = useState(category?.name ?? '')
  const [kind, setKind] = useState(category?.kind ?? defaultKind)
  const [color, setColor] = useState(category?.color ?? COLOR_CHOICES[0])
  const [hexInput, setHexInput] = useState(category?.color ?? COLOR_CHOICES[0])
  const [icon, setIcon] = useState(category?.icon ?? ICON_CHOICES[0])
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [blockedCount, setBlockedCount] = useState(null)
  const [busy, setBusy] = useState(false)

  function pickColor(c) {
    setColor(c)
    setHexInput(c)
  }

  function onHexChange(v) {
    setHexInput(v)
    if (HEX_RE.test(v)) setColor(v)
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Enter a category name.')
      return
    }
    if (!HEX_RE.test(color)) {
      setError('Choose a valid hex color (e.g. #2EE8C6).')
      return
    }
    setBusy(true)
    try {
      await onSubmit({ name, kind, color, icon })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      const res = await onDelete()
      if (res && res.ok === false) {
        setBlockedCount(res.count)
        setConfirmDelete(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Live preview */}
      <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-elevated p-3">
        <CategoryIcon name={icon} color={color} />
        <div className="min-w-0">
          <div className="truncate font-medium text-txt-primary">{name || 'New category'}</div>
          <div className="text-sm capitalize text-txt-secondary">{kind}</div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-txt-secondary">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Groceries"
          className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
          autoFocus
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-txt-secondary">Kind</label>
        <SegmentedPill
          value={kind}
          onChange={setKind}
          options={[
            { id: 'expense', label: 'Expense' },
            { id: 'income', label: 'Income' },
          ]}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm text-txt-secondary">Color</label>
        <div className="mb-2 flex flex-wrap gap-2">
          {COLOR_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pickColor(c)}
              aria-label={c}
              className={`h-8 w-8 rounded-full border-2 transition-transform ${
                color.toLowerCase() === c.toLowerCase()
                  ? 'scale-110 border-white'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <input
          value={hexInput}
          onChange={(e) => onHexChange(e.target.value)}
          placeholder="#2EE8C6"
          spellCheck={false}
          className="w-full rounded-2xl border border-hairline bg-elevated px-4 py-2.5 font-mono text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm text-txt-secondary">Icon</label>
        <div className="grid grid-cols-7 gap-2">
          {ICON_CHOICES.map((n) => {
            const Glyph = getIcon(n)
            const active = icon === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => setIcon(n)}
                aria-label={n}
                className={`flex aspect-square items-center justify-center rounded-tile border transition-colors ${
                  active ? 'border-accent bg-accent/10' : 'border-hairline bg-elevated'
                }`}
                style={active ? { color } : undefined}
              >
                <Glyph size={20} color={active ? color : '#9BA1AC'} />
              </button>
            )
          })}
        </div>
      </div>

      {error && <p className="text-sm text-expense">{error}</p>}
      {blockedCount != null && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Can’t delete — used by {blockedCount} transaction{blockedCount === 1 ? '' : 's'}.
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-2xl border border-hairline py-3 font-semibold text-txt-secondary hover:text-txt-primary"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="flex-1 rounded-2xl bg-accent py-3 font-semibold text-black active:opacity-80 disabled:opacity-50"
        >
          {isEdit ? 'Save' : 'Add Category'}
        </button>
      </div>

      {isEdit && onDelete && (
        <button
          onClick={handleDelete}
          disabled={busy}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl border py-3 font-semibold transition-colors ${
            confirmDelete
              ? 'border-expense bg-expense/10 text-expense'
              : 'border-hairline text-txt-secondary hover:text-expense'
          }`}
        >
          <Trash2 size={18} />
          {confirmDelete ? 'Tap again to confirm delete' : 'Delete'}
        </button>
      )}
    </div>
  )
}
