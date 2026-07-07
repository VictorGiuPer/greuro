import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { formatAmount } from '../../lib/format'
import useCountUp from '../../lib/useCountUp'

const OTHER_COLOR = '#6B7280'
const MAX_LEGEND = 6

/**
 * "Spending by Category" card: donut (thick ring, 2px card-colored gaps
 * between segments) with the period total in the center, legend on the right
 * with name · amount · %. Categories beyond the top 6 fold into "Other".
 * Tapping the chart opens the focused view (onOpenFocus).
 */
export default function SpendingDonut({ rows, categoriesById, onOpenFocus }) {
  const { slices, total } = useMemo(() => {
    const sum = rows.reduce((acc, r) => acc + r.total, 0)
    const head = rows.slice(0, MAX_LEGEND - 1)
    const tailTotal = rows.slice(MAX_LEGEND - 1).reduce((acc, r) => acc + r.total, 0)
    const out = head.map((r) => {
      const cat = categoriesById.get(r.categoryId)
      return {
        name: cat?.name ?? 'Uncategorized',
        color: cat?.color ?? OTHER_COLOR,
        total: r.total,
      }
    })
    if (tailTotal > 0) out.push({ name: 'Other', color: OTHER_COLOR, total: tailTotal })
    return { slices: out, total: sum }
  }, [rows, categoriesById])

  const animatedTotal = useCountUp(total)

  return (
    <section className="rounded-card border border-hairline bg-card p-4">
      <h2 className="mb-3 text-sm font-medium text-txt-secondary">Spending by Category</h2>

      {slices.length === 0 ? (
        <p className="py-8 text-center text-sm text-txt-muted">No spending in this period.</p>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onOpenFocus?.()
            }
          }}
          aria-label="Open focused spending view"
          className="flex w-full cursor-pointer items-center gap-4 rounded-2xl text-left transition-colors active:bg-white/[0.03]"
        >
          {/* Donut with centered total */}
          <div className="relative h-[150px] w-[150px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="total"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={72}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                  stroke="#14161B"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-lg font-bold tabular-nums text-txt-primary">
                {formatAmount(animatedTotal)}
              </div>
              <div className="text-xs text-txt-muted">Total</div>
            </div>
          </div>

          {/* Legend: name · amount · % */}
          <ul className="min-w-0 flex-1 space-y-2">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-txt-secondary">{s.name}</span>
                <span className="shrink-0 tabular-nums text-txt-primary">
                  {formatAmount(s.total)}
                </span>
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-txt-muted">
                  {total > 0 ? Math.round((s.total / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
