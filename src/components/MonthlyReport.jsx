import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { monthlyReport } from '../db'
import { exportMonthlyReport } from '../lib/exportXlsx'
import { formatAmount, formatMonth } from '../lib/format'
import { noon } from '../lib/dates'
import CategoryIcon from './CategoryIcon'

/**
 * In-app monthly report: totals, top categories, month-over-month delta and
 * net-worth change for a selectable month. Exportable to .xlsx.
 */
export default function MonthlyReport({ open, onClose, categoriesById }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [mIdx, setMIdx] = useState(now.getMonth())
  const [report, setReport] = useState(null)
  const [exporting, setExporting] = useState(false)

  // Reset to the current month each time the overlay opens.
  useEffect(() => {
    if (!open) return
    const d = new Date()
    setYear(d.getFullYear())
    setMIdx(d.getMonth())
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    monthlyReport(year, mIdx).then((r) => {
      if (active) setReport(r)
    })
    return () => {
      active = false
    }
  }, [open, year, mIdx])

  const monthLabel = useMemo(() => formatMonth(noon(year, mIdx, 1)), [year, mIdx])

  function step(delta) {
    const d = new Date(year, mIdx + delta, 1)
    setYear(d.getFullYear())
    setMIdx(d.getMonth())
  }

  async function handleExport() {
    if (!report) return
    setExporting(true)
    try {
      await exportMonthlyReport(report, monthLabel, categoriesById)
    } finally {
      setExporting(false)
    }
  }

  const expenseTotal = report?.totals.expense ?? 0

  return (
    <div
      className={`fixed inset-0 z-50 mx-auto flex w-full max-w-[430px] flex-col bg-bg ${
        open ? 'overlay-open translate-x-0' : 'overlay-closed pointer-events-none translate-x-full'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Monthly report"
      aria-hidden={open ? undefined : 'true'}
    >
      <header className="safe-pt flex items-center gap-3 border-b border-hairline px-4 pb-4">
        <button
          onClick={onClose}
          aria-label="Back"
          className="rounded-full p-1.5 text-txt-secondary hover:bg-white/5"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="flex-1 text-lg font-semibold text-txt-primary">Monthly Report</h1>
        <button
          onClick={handleExport}
          disabled={exporting || !report}
          aria-label="Export report as Excel"
          className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/25 disabled:opacity-50"
        >
          <Download size={15} />
          .xlsx
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4">
        {/* Month stepper */}
        <div className="mb-4 flex items-center justify-between rounded-card border border-hairline bg-card px-2 py-2">
          <button
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="rounded-full p-2 text-txt-secondary hover:bg-white/5"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-base font-semibold text-txt-primary">{monthLabel}</span>
          <button
            onClick={() => step(1)}
            aria-label="Next month"
            className="rounded-full p-2 text-txt-secondary hover:bg-white/5"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {report && (
          <>
            {/* Totals */}
            <div className="mb-4 grid grid-cols-3 gap-3">
              <StatCard label="Income" value={report.totals.income} cls="text-income" />
              <StatCard label="Expenses" value={report.totals.expense} cls="text-expense" />
              <StatCard
                label="Net"
                value={report.totals.net}
                cls={report.totals.net < 0 ? 'text-expense' : 'text-accent'}
                signed
              />
            </div>

            {/* Vs previous month */}
            <Card title="Vs previous month">
              <DeltaRow label="Income" delta={report.delta.income} goodWhenUp />
              <DeltaRow label="Expenses" delta={report.delta.expense} goodWhenUp={false} />
              <DeltaRow label="Net" delta={report.delta.net} goodWhenUp />
            </Card>

            {/* Net worth change */}
            <Card title="Net worth">
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-txt-secondary">Start of month</span>
                <span className="tabular-nums text-txt-primary">
                  {signedEuro(report.netWorthStart)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-txt-secondary">End of month</span>
                <span className="tabular-nums text-txt-primary">
                  {signedEuro(report.netWorthEnd)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-hairline pt-2 text-sm font-semibold">
                <span className="text-txt-secondary">Change</span>
                <span
                  className={`tabular-nums ${
                    report.netWorthChange < 0 ? 'text-expense' : 'text-income'
                  }`}
                >
                  {report.netWorthChange >= 0 ? '+' : ''}
                  {signedEuro(report.netWorthChange)}
                </span>
              </div>
            </Card>

            {/* Top categories */}
            <Card title="Top spending categories">
              {report.topCategories.length === 0 && (
                <p className="py-3 text-center text-sm text-txt-muted">
                  No spending this month.
                </p>
              )}
              {report.topCategories.map((row, i) => {
                const cat = categoriesById.get(row.categoryId)
                return (
                  <div key={row.categoryId ?? 'none'} className="flex items-center gap-3 py-1.5">
                    <span className="w-4 text-xs tabular-nums text-txt-muted">{i + 1}.</span>
                    <CategoryIcon name={cat?.icon} color={cat?.color} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm text-txt-primary">
                      {cat?.name ?? 'Uncategorized'}
                    </span>
                    <span className="tabular-nums text-sm text-txt-primary">
                      {formatAmount(row.total)}
                    </span>
                    <span className="w-9 text-right text-xs tabular-nums text-txt-muted">
                      {expenseTotal > 0 ? Math.round((row.total / expenseTotal) * 100) : 0}%
                    </span>
                  </div>
                )
              })}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function signedEuro(v) {
  return `${v < 0 ? '-' : ''}${formatAmount(v)}`
}

function StatCard({ label, value, cls, signed }) {
  return (
    <div className="rounded-card border border-hairline bg-card p-3">
      <div className="mb-1 text-xs text-txt-muted">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${cls}`}>
        {signed && value < 0 ? '-' : ''}
        {formatAmount(value)}
      </div>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <section className="mb-4 rounded-card border border-hairline bg-card p-4">
      <h2 className="mb-2 text-sm font-medium text-txt-secondary">{title}</h2>
      {children}
    </section>
  )
}

function DeltaRow({ label, delta, goodWhenUp }) {
  const up = delta >= 0
  const good = goodWhenUp ? up : !up
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-txt-secondary">{label}</span>
      <span className={`tabular-nums ${delta === 0 ? 'text-txt-muted' : good ? 'text-income' : 'text-expense'}`}>
        {up ? '▲' : '▼'} {formatAmount(Math.abs(delta))}
      </span>
    </div>
  )
}
