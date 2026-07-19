import { useEffect, useMemo, useState } from 'react'
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
import { projectBands, investmentTargetId } from '../../lib/forecast'
import { formatAmount, parseAmountInput, toAmountInputValue } from '../../lib/format'

const HORIZONS = [1, 5, 10, 20]

const compactEuro = (v) =>
  Math.abs(v) >= 1000
    ? `${(v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 0 })}k`
    : Math.round(v).toLocaleString('de-DE')

function BandTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-xl border border-hairline bg-elevated px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-txt-secondary">
        {new Date(label).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
      </div>
      <div className="tabular-nums text-txt-primary">Base: {formatAmount(point.base)}</div>
      <div className="tabular-nums text-txt-muted">
        {formatAmount(point.pess)} – {formatAmount(point.opt)}
      </div>
    </div>
  )
}

/**
 * Forward net-worth projection card: base line + shaded pessimistic–optimistic
 * band, horizon selector, inflation toggle. Assumptions, not predictions.
 */
export default function ForecastCard({ accounts, balances, scheduled, settings, onSettingChange }) {
  const horizon = settings.forecastHorizonYears
  const adjust = settings.inflationAdjust

  // "Standard investment" — draft string; committed on blur/Enter.
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

  const investTargetName = useMemo(() => {
    if (!(Number(settings.monthlyInvestment) > 0) || accounts.length === 0) return null
    const id = investmentTargetId(accounts)
    return accounts.find((a) => a.id === id)?.name ?? null
  }, [accounts, settings.monthlyInvestment])

  const data = useMemo(() => {
    if (!accounts.length || !balances) return []
    return projectBands({
      accounts,
      startBalances: balances,
      scheduled,
      horizonYears: horizon,
      settings,
    })
  }, [accounts, balances, scheduled, horizon, settings])

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
              className={`min-w-[38px] rounded-full px-2 py-1 text-xs font-semibold transition-colors ${
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
          <div className="h-[190px]">
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

          {/* Standard investment: keep investing X €/month */}
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-hairline bg-elevated px-3 py-2">
            <label htmlFor="forecast-invest" className="text-sm text-txt-secondary">
              Keep investing
            </label>
            <span className="flex items-center gap-1">
              <input
                id="forecast-invest"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={investDraft}
                onChange={(e) => setInvestDraft(e.target.value)}
                onBlur={commitInvest}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-20 rounded-lg bg-white/5 px-2 py-1 text-right text-sm font-semibold tabular-nums text-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <span className="text-sm text-txt-muted">€/mo</span>
            </span>
          </div>
          {investTargetName && (
            <p className="mt-1 px-1 text-[11px] text-txt-muted">
              Contributions compound in {investTargetName}.
            </p>
          )}

          {/* Legend + inflation toggle */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-txt-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-accent" aria-hidden="true" />
                Base
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded bg-accent/20" aria-hidden="true" />
                Pessimistic–optimistic
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

          <p className="mt-2 text-[11px] leading-snug text-txt-muted">
            Illustrative projection from your return assumptions ({settings.returnPess}/
            {settings.returnBase}/{settings.returnOpt} %{adjust ? `, ${settings.inflationRate} % inflation` : ''}
            ), recurring transactions and the monthly investment above. Not a prediction or
            financial advice.
          </p>
        </>
      )}
    </section>
  )
}
