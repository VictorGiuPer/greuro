import SegmentedPill from '../SegmentedPill'
import { toDateInputValue, fromDateInputValue } from '../../lib/format'

const KINDS = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
]

/**
 * Dashboard period control: Week · Month · Quarter · Year · Custom.
 * Custom reveals a from/to day pair. State lives in the parent:
 * { kind, customFrom, customTo } (ms timestamps for the custom bounds).
 */
export default function PeriodPicker({ period, onChange }) {
  return (
    <div>
      <SegmentedPill
        value={period.kind}
        onChange={(kind) => onChange({ ...period, kind })}
        options={KINDS}
      />
      {period.kind === 'custom' && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="period-from" className="mb-1 block text-xs text-txt-muted">
              From
            </label>
            <input
              id="period-from"
              type="date"
              value={toDateInputValue(period.customFrom)}
              onChange={(e) =>
                e.target.value &&
                onChange({ ...period, customFrom: fromDateInputValue(e.target.value) })
              }
              className="w-full rounded-2xl border border-hairline bg-card px-4 py-2.5 text-sm text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>
          <div>
            <label htmlFor="period-to" className="mb-1 block text-xs text-txt-muted">
              To
            </label>
            <input
              id="period-to"
              type="date"
              value={toDateInputValue(period.customTo)}
              onChange={(e) =>
                e.target.value &&
                onChange({ ...period, customTo: fromDateInputValue(e.target.value) })
              }
              className="w-full rounded-2xl border border-hairline bg-card px-4 py-2.5 text-sm text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>
        </div>
      )}
    </div>
  )
}
