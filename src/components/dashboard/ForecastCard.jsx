import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { projectBands, referencePoints, investmentTargetId } from '../../lib/forecast'
import { formatAmount, parseAmountInput, toAmountInputValue } from '../../lib/format'

const HORIZONS = [5, 10, 20]

const compactEuro = (v) =>
  Math.abs(v) >= 1000
    ? `${(v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 0 })}k`
    : Math.round(v).toLocaleString('de-DE')

// Whole-euro amount for the reference readout (no cents, with € suffix).
const wholeEuro = (v) => `${Math.round(v).toLocaleString('de-DE')} €`

function BandTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-xl border border-hairline bg-elevated px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-txt-secondary">
        {new Date(label).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
      </div>
      <div className="tabular-nums text-txt-primary">Expected: {formatAmount(point.base)}</div>
      <div className="tabular-nums text-txt-muted">
        {formatAmount(point.pess)} – {formatAmount(point.opt)}
      </div>
    </div>
  )
}

/**
 * Investment growth projection: each investment account compounds at its own
 * expected return; the "keep investing" amount flows into a chosen account.
 * Best/worst bands = every rate ± the settings spread. Assumptions, not
 * predictions. Five reference values below the chart make each year explicit.
 */
export default function ForecastCard({ accounts, balances, settings, onSettingChange }) {
  const horizon = HORIZONS.includes(settings.forecastHorizonYears)
    ? settings.forecastHorizonYears
    : 5
  const adjust = settings.inflationAdjust
  const spread = Number(settings.forecastBandSpread) || 0

  // "Keep investing" — draft string; committed on blur/Enter.
  const [investDraft, setInvestDraft] = useState(toAmountInputValue(settings.monthlyInvestment))
  useEffect(() => {
    setInvestDraft(toAmountInputValue(settings.monthlyInvestment))
  }, [settings.monthlyInvestment])

  function commitInvest() {
    const n = parseAmountInput(investDraft)
    const value = Number.isFinite(n) && n > 0 ? n : 0
    if (value !== settings.monthlyInvestment) onSettingChange('monthlyInvestment', value)
    setInvestDraft(toAmountInputValue(value))
  }

  // Which account the monthly contribution flows into (default = best rate).
  const targetId = useMemo(() => {
    const stored = settings.investmentTargetAccountId
    if (stored != null && accounts.some((a) => a.id === stored)) return stored
    return investmentTargetId(accounts)
  }, [accounts, settings.investmentTargetAccountId])

  const data = useMemo(() => {
    if (!accounts.length || !balances) return []
    return projectBands({ accounts, startBalances: balances, horizonYears: horizon, settings })
  }, [accounts, balances, horizon, settings])

  const refs = useMemo(() => referencePoints(data, horizon), [data, horizon])
  const anyReturn = accounts.some((a) => (Number(a.expectedAnnualReturn) || 0) > 0)

  const yearTick = (ts) => `'${String(new Date(ts).getFullYear()).slice(2)}`

  return (
    <section className="rounded-card border border-hairline bg-card p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-txt-secondary">Investment Growth</h2>
        {/* Horizon selector */}
        <div
          className="flex rounded-full border border-hairline bg-elevated p-0.5"
          role="group"
          aria-label="Forecast horizon"
        >
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onSettingChange('forecastHorizonYears', h)}
              aria-pressed={h === horizon}
              className={`min-w-[40px] rounded-full px-2 py-1 text-xs font-semibold transition-colors ${
                h === horizon ? 'bg-accent text-black' : 'text-txt-secondary'
              }`}
            >
              {h}y
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-txt-muted">
          Mark an account as “Investment” in Settings to project its growth.
        </p>
      ) : (
        <>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="ts"
                  tickFormatter={yearTick}
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tickFormatter={compactEuro}
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<BandTooltip />} />
                <Area
                  dataKey="range"
                  stroke="none"
                  fill="#2EE8C6"
                  fillOpacity={0.12}
                  isAnimationActive={false}
                  activeDot={false}
                />
                <Line
                  dataKey="base"
                  stroke="#2EE8C6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Reference readout — the exact projected value at 5 even steps. */}
          <div className="mt-2 grid grid-cols-5 gap-1 rounded-xl border border-hairline bg-elevated p-2">
            {refs.map((r) => (
              <div key={r.year} className="text-center">
                <div className="text-[10px] text-txt-muted">Yr {r.year}</div>
                <div className="text-[11px] font-semibold tabular-nums text-txt-primary">
                  {wholeEuro(r.value)}
                </div>
              </div>
            ))}
          </div>

          {/* Keep investing X €/month into a chosen account */}
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-hairline bg-elevated px-3 py-2">
            <label htmlFor="forecast-invest" className="shrink-0 text-sm text-txt-secondary">
              Keep investing
            </label>
            <div className="flex items-center gap-1">
              <input
                id="forecast-invest"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={investDraft}
                onChange={(e) => setInvestDraft(e.target.value)}
                onBlur={commitInvest}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-16 rounded-lg bg-white/5 px-2 py-1 text-right text-sm font-semibold tabular-nums text-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <span className="text-sm text-txt-muted">€/mo</span>
            </div>
          </div>

          {/* Which account the contribution flows into */}
          {settings.monthlyInvestment > 0 && accounts.length > 0 && (
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-txt-muted">
                Invest into
              </span>
              <select
                value={targetId ?? ''}
                onChange={(e) => onSettingChange('investmentTargetAccountId', Number(e.target.value))}
                aria-label="Account the monthly investment flows into"
                className="w-full appearance-none truncate rounded-xl border border-hairline bg-elevated py-2 pl-24 pr-7 text-right text-xs font-medium text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.expectedAnnualReturn || 0}%)
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-txt-muted"
                aria-hidden="true"
              />
            </div>
          )}

          {/* Legend + inflation toggle */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-txt-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-accent" aria-hidden="true" />
                Expected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded bg-accent/20" aria-hidden="true" />
                ±{spread}%
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={adjust}
              onClick={() => onSettingChange('inflationAdjust', !adjust)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                adjust
                  ? 'border-accent/60 bg-accent/15 text-accent'
                  : 'border-hairline bg-elevated text-txt-secondary'
              }`}
            >
              Adjust for inflation
            </button>
          </div>

          {!anyReturn && (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
              Set an expected return on your investment accounts (Settings) so this grows.
            </p>
          )}

          <p className="mt-2 text-[11px] leading-snug text-txt-muted">
            Illustrative: each investment account compounds at its own expected return, ±{spread}
            {' '}pts for the band, plus the monthly amount above
            {adjust ? `, in today's euros (${settings.inflationRate}% inflation)` : ''}. Not a
            prediction or financial advice.
          </p>
        </>
      )}
    </section>
  )
}
