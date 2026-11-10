import { useId, useState } from 'react'
import { formatAmount, parseAmountInput } from '../../lib/format'
import { averageWindowMonths, goalProgress, savingTime } from '../../lib/savings'

const kinds = [
  { key: 'expenses', label: 'Expenses', color: '#f87171' },
  { key: 'investments', label: 'Investments', color: '#a78bfa' },
  { key: 'savings', label: 'Savings', color: '#2ee8c6' },
]
const signedAmount = (value) => `${value < 0 ? '−' : ''}${formatAmount(value)}`
const monthLabel = (row) => row.key === 'Average' ? 'Average' : new Date(`${row.key}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short' })

function AllocationBars({ rows }) {
  const patternId = `allocation-${useId().replace(/:/g, '')}`
  const positiveMax = Math.max(100, ...rows.map((row) => kinds.reduce((sum, kind) => sum + Math.max(0, row.percentages?.[kind.key] || 0), 0)))
  const negativeMin = Math.min(0, ...rows.map((row) => kinds.reduce((sum, kind) => sum + Math.min(0, row.percentages?.[kind.key] || 0), 0)))
  const y = (value) => 14 + (positiveMax - value) / (positiveMax - negativeMin) * 140
  const center = (index) => 36 + (index + 0.5) * 79.5
  return <svg viewBox="0 0 360 193" className="block w-full" role="img" aria-label="Three months and average allocation. Bars show percentages of income; negative values extend below zero.">
    <defs>{kinds.map((kind) => <pattern key={kind.key} id={`${patternId}-${kind.key}`} width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill={kind.color} /><path d="M-1,1 L1,-1 M0,6 L6,0 M5,7 L7,5" stroke="#0a0b0f" strokeWidth="1.5" opacity="0.45" /></pattern>)}</defs>
    <line x1="33" x2="354" y1={y(100)} y2={y(100)} stroke="#9ba1ac" strokeDasharray="3 3" opacity="0.5" />
    <text x="29" y={y(100) - 4} textAnchor="end" fill="#9ba1ac" fontSize="10">100%</text>
    <line x1="33" x2="354" y1={y(0)} y2={y(0)} stroke="#9ba1ac" opacity="0.65" />
    <text x="29" y={y(0) + 4} textAnchor="end" fill="#9ba1ac" fontSize="10">0%</text>
    {rows.map((row, index) => {
      let positive = 0, negative = 0
      return <g key={row.key} data-allocation-month={row.key}>
        {kinds.map((kind) => {
          const value = row.percentages?.[kind.key] || 0
          if (!value) return null
          const start = value > 0 ? positive : negative
          const end = start + value
          if (value > 0) positive = end; else negative = end
          return <rect key={kind.key} x={center(index) - 17} y={Math.min(y(start), y(end))} width="34" height={Math.abs(y(start) - y(end))} fill={value < 0 ? `url(#${patternId}-${kind.key})` : kind.color}>
            <title>{`${monthLabel(row)} · ${kind.label}: ${signedAmount(row[kind.key])} · ${value}%`}</title>
          </rect>
        })}
        {!row.percentages && <text x={center(index)} y={y(0) - 8} textAnchor="middle" fill="#9ba1ac" fontSize="12">—</text>}
        <text x={center(index)} y="173" textAnchor="middle" fill={row.key === 'Average' ? '#f4f6f8' : '#9ba1ac'} fontSize="11" fontWeight={row.key === 'Average' ? 600 : 400}>{monthLabel(row)}</text>
        {row.current && <text x={center(index)} y="187" textAnchor="middle" fill="#9ba1ac" fontSize="9">so far</text>}
      </g>
    })}
  </svg>
}

export default function AllocationCard({ rows, data, onAverageMonthsChange }) {
  const [choice, setChoice] = useState('custom')
  const [amount, setAmount] = useState('')
  const [savingRange, setSavingRange] = useState(false)
  const [rangeError, setRangeError] = useState('')
  const average = rows.at(-1)
  const averageMonths = averageWindowMonths(average.months)
  const goal = data.goals.find((g) => String(g.id) === choice)
  const remaining = goal ? goalProgress(goal, data).remaining : parseAmountInput(amount)
  const estimate = Number.isFinite(remaining) && remaining >= 0 ? savingTime(remaining, average.savings) : null
  async function changeRange(value) {
    setSavingRange(true); setRangeError('')
    try { await onAverageMonthsChange(Number(value)) } catch (error) { setRangeError(error.message) } finally { setSavingRange(false) }
  }
  return <section className="rounded-card border border-hairline bg-card p-4">
    <h2 className="text-sm font-medium text-txt-secondary">Monthly allocation</h2>
    <div className="my-3 flex flex-wrap gap-3 text-[11px] text-txt-secondary">{kinds.map((kind) => <span key={kind.key}><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: kind.color }} />{kind.label}</span>)}</div>
    <AllocationBars rows={rows} />
    <div className="grid grid-cols-4 gap-1 text-center text-[10px] tabular-nums" style={{ marginLeft: '10%', marginRight: '1.7%' }}>
      {rows.map((row) => <dl key={row.key} aria-label={row.key === 'Average' ? `Average over ${averageMonths} completed months` : `${row.key}${row.current ? ' so far' : ''}`} className={`min-w-0 space-y-2 ${row.key === 'Average' ? 'border-l border-hairline pl-1' : ''}`}>
        <div className="text-txt-muted"><dt className="text-[9px]">Income</dt><dd className="break-all">{signedAmount(row.income)}</dd></div>
        {kinds.map((kind) => <div key={kind.key} style={{ color: kind.color }}><dt className="sr-only">{kind.label}</dt><dd className="break-all">{signedAmount(row[kind.key])}<span className="block text-txt-muted">{row.percentages ? `${row.percentages[kind.key]}%` : '—'}</span></dd></div>)}
      </dl>)}
    </div>
    <label className="mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-3 text-xs text-txt-secondary">
      <span>Average over</span>
      <select aria-label="Average period" value={averageMonths} disabled={savingRange} onChange={(event) => changeRange(event.target.value)} className="min-h-[36px] rounded-lg bg-elevated px-2 py-1 text-xs text-txt-primary disabled:opacity-50">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((months) => <option key={months} value={months}>Last {months} completed {months === 1 ? 'month' : 'months'}</option>)}
      </select>
    </label>
    {rangeError && <p role="alert" className="mt-2 text-xs text-expense">{rangeError}</p>}
    <details className="mt-3 border-t border-hairline pt-3">
      <summary className="cursor-pointer text-sm font-medium text-txt-secondary">Time to save</summary>
      <select aria-label="Savings calculator goal" value={choice} onChange={(e) => setChoice(e.target.value)} className="mt-3 w-full rounded-xl bg-elevated p-3 text-sm">
        <option value="custom">Custom amount</option>{data.goals.filter((g) => !g.archived && g.modelVersion === 2).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      {!goal && <input aria-label="Custom savings target" inputMode="decimal" placeholder="Amount (€)" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2 w-full rounded-xl bg-elevated p-3 text-sm" />}
      {estimate && <p className="mt-2 text-sm text-accent">{estimate.status === 'reached' ? 'Goal reached' : estimate.status === 'unreachable' ? 'This target cannot be reached at your current savings rate.' : `${estimate.months} month${estimate.months === 1 ? '' : 's'} at ${formatAmount(average.savings)}/month`}</p>}
    </details>
  </section>
}
