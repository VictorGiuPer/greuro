import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { formatAmount } from '../../lib/format'
import CategoryIcon from '../CategoryIcon'

const OTHER_COLOR = '#6B7280'

/**
 * Focused spending view (opened by tapping the dashboard donut): a large
 * donut of the period's spending with EVERY category listed — tap categories
 * to include/exclude them and the chart, total and percentages re-derive
 * from the selection.
 */
export default function SpendingFocus({ open, onClose, rows, categoriesById, periodLabel }) {
  const [excluded, setExcluded] = useState(() => new Set())

  // Fresh selection every time the view opens.
  useEffect(() => {
    if (open) setExcluded(new Set())
  }, [open])

  const all = useMemo(
    () =>
      rows.map((r) => {
        const cat = categoriesById.get(r.categoryId)
        return {
          id: r.categoryId,
          name: cat?.name ?? 'Uncategorized',
          color: cat?.color ?? OTHER_COLOR,
          icon: cat?.icon,
          total: r.total,
        }
      }),
    [rows, categoriesById],
  )

  const included = all.filter((s) => !excluded.has(s.id))
  const total = included.reduce((acc, s) => acc + s.total, 0)

  function toggle(id) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Spending by category"
      aria-hidden={open ? undefined : 'true'}
      className={`fixed inset-0 z-50 mx-auto flex w-full max-w-[430px] flex-col bg-bg ${
        open ? 'overlay-open translate-x-0' : 'overlay-closed pointer-events-none translate-x-full'
      }`}
    >
      <header className="safe-pt flex items-center gap-3 border-b border-hairline px-4 pb-4">
        <button
          onClick={onClose}
          aria-label="Back"
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-txt-primary">Spending by Category</h1>
          <p className="text-xs text-txt-muted">{periodLabel}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4">
        {/* Large donut */}
        <div className="relative mx-auto h-[240px] w-[240px]">
          {included.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={included}
                  dataKey="total"
                  nameKey="name"
                  innerRadius={82}
                  outerRadius={114}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                  stroke="#0A0B0F"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {included.map((s) => (
                    <Cell key={s.id ?? 'none'} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="absolute inset-4 rounded-full border border-dashed border-white/10" />
          )}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-bold tabular-nums text-txt-primary">
              {formatAmount(total)}
            </div>
            <div className="text-xs text-txt-muted">
              {included.length === all.length
                ? 'Total'
                : `${included.length} of ${all.length} categories`}
            </div>
          </div>
        </div>

        <p className="mb-2 mt-4 px-1 text-xs text-txt-muted">
          Tap a category to include or exclude it.
        </p>

        {/* Toggleable category list */}
        <div className="overflow-hidden rounded-card border border-hairline bg-card">
          {all.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-txt-muted">
              No spending in this period.
            </p>
          )}
          {all.map((s, i) => {
            const off = excluded.has(s.id)
            const pct = !off && total > 0 ? Math.round((s.total / total) * 100) : null
            return (
              <div key={s.id ?? 'none'}>
                {i > 0 && <div className="mx-4 h-px bg-hairline" />}
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-pressed={!off}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-opacity active:bg-white/[0.03] ${
                    off ? 'opacity-40' : ''
                  }`}
                >
                  <CategoryIcon name={s.icon} color={s.color} size={36} />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm font-medium ${
                      off ? 'text-txt-muted line-through' : 'text-txt-primary'
                    }`}
                  >
                    {s.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-sm text-txt-primary">
                    {formatAmount(s.total)}
                  </span>
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-txt-muted">
                    {pct != null ? `${pct}%` : '-'}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
