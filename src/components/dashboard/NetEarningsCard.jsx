import { CalendarDays } from 'lucide-react'
import { formatAmount } from '../../lib/format'
import useCountUp from '../../lib/useCountUp'

/** Income − expenses for the period (transfers excluded). */
export default function NetEarningsCard({ totals }) {
  const net = useCountUp(totals.net)
  const negative = totals.net < 0
  return (
    <section className="rounded-card border border-hairline bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-txt-secondary">Net Earnings</h2>
        <CalendarDays size={16} className="text-txt-muted" aria-hidden="true" />
      </div>
      <div
        className={`text-xl font-bold tabular-nums ${negative ? 'text-expense' : 'text-accent'}`}
      >
        {negative ? '-' : ''}
        {formatAmount(net)}
      </div>
    </section>
  )
}
