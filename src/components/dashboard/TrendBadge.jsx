/**
 * "▲ 8,4 % vs last period" trend line. `current` and `previous` are the
 * compared values; hidden when there is no meaningful previous value.
 */
export default function TrendBadge({ current, previous, compareLabel = 'vs previous period' }) {
  if (previous == null || previous === 0) return null
  const pct = ((current - previous) / Math.abs(previous)) * 100
  if (!Number.isFinite(pct)) return null
  const up = pct >= 0
  return (
    <div className="mt-1 flex items-center gap-1 text-xs">
      <span className={up ? 'text-income' : 'text-expense'}>
        {up ? '▲' : '▼'}{' '}
        {Math.abs(pct).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %
      </span>
      <span className="text-txt-muted">{compareLabel}</span>
    </div>
  )
}
