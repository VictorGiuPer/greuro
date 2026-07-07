/**
 * Segmented pill control (design-spec period pill): teal active state on a dark
 * rounded track. Reused for Expense/Income/Transfer, asset/liability, etc.
 *
 * @param options  [{ id, label }]
 * @param value    active id
 * @param onChange (id) => void
 */
export default function SegmentedPill({ options, value, onChange }) {
  return (
    <div
      className="grid gap-1 rounded-full border border-hairline bg-elevated p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded-full py-2 text-sm font-semibold transition-colors ${
              active ? 'bg-accent text-black' : 'text-txt-secondary hover:text-txt-primary'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
