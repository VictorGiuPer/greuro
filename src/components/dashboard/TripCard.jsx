import { Plane, ChevronDown } from 'lucide-react'
import { formatAmount } from '../../lib/format'
import useCountUp from '../../lib/useCountUp'

/**
 * Trip spend card on the Overview (below the savings goal). Shows the selected
 * trip's total spend and spend-per-day, with a switcher to change trips —
 * mirrors the Cash Flow card's account picker. Unobtrusive: only meaningful
 * once you've created a trip.
 *
 * @param trips     active (non-archived) trips
 * @param tripId    currently selected trip id
 * @param spend     computeTripSpend() result for the selected trip, or null
 * @param onSelect  (id) => void  switch trip
 * @param onCreate  () => void    open the trip form to create one
 * @param onEdit    () => void    open the trip form for the selected trip
 */
export default function TripCard({ trips, tripId, spend, onSelect, onCreate, onEdit }) {
  const total = useCountUp(spend?.total ?? 0)

  // No trips yet → subtle invite.
  if (!trips || trips.length === 0) {
    return (
      <section className="rounded-card border border-hairline bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Plane size={16} className="text-txt-muted" aria-hidden="true" />
          <h2 className="text-sm font-medium text-txt-secondary">Trips</h2>
        </div>
        <p className="mb-3 text-sm text-txt-muted">
          Tag transactions to a trip to see what a holiday cost.
        </p>
        <button
          onClick={onCreate}
          className="w-full rounded-2xl bg-accent/15 py-2.5 text-sm font-semibold text-accent hover:bg-accent/25"
        >
          New trip
        </button>
      </section>
    )
  }

  return (
    <section className="rounded-card border border-hairline bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Plane size={16} className="text-txt-muted" aria-hidden="true" />
          <h2 className="text-sm font-medium text-txt-secondary">Trip spend</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onCreate}
            className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent hover:bg-accent/25"
          >
            + New
          </button>
          <button
            onClick={onEdit}
            className="rounded-full px-2 py-0.5 text-xs font-medium text-txt-muted hover:text-txt-primary"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div className="text-xl font-bold tabular-nums text-txt-primary">{formatAmount(total)}</div>
        {spend && (
          <div className="pb-0.5 text-xs text-txt-muted tabular-nums">
            {formatAmount(spend.perDay)}/day · {spend.days}d
          </div>
        )}
      </div>

      {/* Trip switcher — same style as the Cash Flow account picker. */}
      <div className="relative mt-1.5">
        <select
          value={tripId ?? ''}
          onChange={(e) => onSelect(Number(e.target.value))}
          aria-label="Trip"
          className="w-full appearance-none truncate rounded-lg border border-hairline bg-elevated py-1 pl-2.5 pr-6 text-xs text-txt-secondary focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-txt-muted"
          aria-hidden="true"
        />
      </div>
    </section>
  )
}
