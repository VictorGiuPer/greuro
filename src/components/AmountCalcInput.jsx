import { useRef } from 'react'
import { evaluate, isExpression } from '../lib/calc'
import { formatAmount } from '../lib/format'

/** Operator keys offered as tap targets (mobile decimal keyboards lack them). */
const OPS = ['+', '−', '×', '÷']

/**
 * The amount field IS a calculator: type `12,50 + 3,20 - 1` and the evaluated
 * result is shown live and committed on save. German comma decimals.
 *
 * Controlled: `value` is the raw expression string, `onChange(str)` updates it.
 * The parent commits `evaluate(value).value` (see lib/calc.js).
 */
export default function AmountCalcInput({ value, onChange, id }) {
  const inputRef = useRef(null)

  const expression = isExpression(value)
  const result = expression ? evaluate(value) : null

  function appendOp(op) {
    onChange(String(value ?? '') + op)
    inputRef.current?.focus()
  }

  return (
    <div>
      <div className="flex items-center rounded-2xl border border-hairline bg-elevated px-4">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck="false"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0,00"
          aria-label="Amount (supports + − × ÷ calculations)"
          className="w-full bg-transparent py-3 text-3xl font-semibold text-txt-primary placeholder:text-txt-muted focus:outline-none"
        />
        <span className="text-2xl font-semibold text-txt-muted">€</span>
      </div>

      {/* Live evaluated result while an expression is being typed. */}
      {expression && (
        <div
          className={`mt-1.5 px-1 text-sm tabular-nums ${
            result?.error ? 'text-expense' : 'text-accent'
          }`}
          aria-live="polite"
        >
          {result?.error
            ? result.error
            : result?.incomplete
              ? '…'
              : `= ${formatAmount(result.value)}`}
        </div>
      )}

      {/* Operator keys — mobile decimal keyboards have no operators. */}
      <div className="mt-2 flex gap-2" role="group" aria-label="Calculator operators">
        {OPS.map((op) => (
          <button
            key={op}
            type="button"
            tabIndex={-1}
            // preventDefault keeps focus (and the keyboard) on the input.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => appendOp(op)}
            className="min-w-[44px] flex-1 rounded-xl border border-hairline bg-elevated py-2 text-lg font-semibold text-txt-secondary transition-colors active:bg-white/10 active:text-txt-primary"
            aria-label={`Insert ${op}`}
          >
            {op}
          </button>
        ))}
      </div>
    </div>
  )
}
