/**
 * Minimal, safe arithmetic evaluator for the amount field — NEVER eval().
 *
 * Grammar (recursive descent):
 *   expr   := term (('+'|'-') term)*
 *   term   := factor (('*'|'/') factor)*
 *   factor := '-' factor | NUMBER | '(' expr ')'
 *
 * Numbers follow the app's German input rule (see parseAmountInput):
 * comma = decimal separator; with a comma present, dots are thousands
 * separators; without a comma a single dot is accepted as decimal.
 * Operator aliases: × ÷ − (unicode) map to * / -.
 */

const OP_ALIASES = { '×': '*', '÷': '/', '−': '-', ':': '/' }

function normalizeNumberToken(tok) {
  let s = tok
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN
  return Number(s)
}

/** str -> { tokens, error } ; tokens are numbers or single-char operators. */
function tokenize(input) {
  const tokens = []
  let i = 0
  const s = String(input ?? '')
  while (i < s.length) {
    const ch = s[i]
    if (ch === ' ' || ch === ' ') {
      i += 1
    } else if (/[0-9]/.test(ch)) {
      let j = i
      while (j < s.length && /[0-9.,]/.test(s[j])) j += 1
      const raw = s.slice(i, j)
      const n = normalizeNumberToken(raw)
      if (Number.isNaN(n)) return { error: `Invalid number "${raw}"` }
      tokens.push(n)
      i = j
    } else if (OP_ALIASES[ch] || '+-*/()'.includes(ch)) {
      tokens.push(OP_ALIASES[ch] ?? ch)
      i += 1
    } else {
      return { error: `Unexpected character "${ch}"` }
    }
  }
  return { tokens }
}

/**
 * Evaluate an arithmetic expression string.
 * @returns {{ value: number|null, error: string|null, incomplete: boolean }}
 *   - incomplete: the user is mid-typing (trailing operator / open paren /
 *     empty) — not an error to shout about, but not savable either.
 */
export function evaluate(input) {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return { value: null, error: null, incomplete: true }

  const { tokens, error } = tokenize(trimmed)
  if (error) return { value: null, error, incomplete: false }
  if (tokens.length === 0) return { value: null, error: null, incomplete: true }

  let pos = 0
  let failed = null // 'incomplete' | 'error'

  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function parseFactor() {
    const t = peek()
    if (t === undefined) {
      failed = failed || 'incomplete'
      return NaN
    }
    if (typeof t === 'number') {
      next()
      return t
    }
    if (t === '-') {
      next()
      return -parseFactor()
    }
    if (t === '(') {
      next()
      const v = parseExpr()
      if (peek() === ')') next()
      else failed = failed || 'incomplete'
      return v
    }
    failed = failed || 'error'
    return NaN
  }

  function parseTerm() {
    let v = parseFactor()
    while (peek() === '*' || peek() === '/') {
      const op = next()
      const rhs = parseFactor()
      v = op === '*' ? v * rhs : v / rhs
    }
    return v
  }

  function parseExpr() {
    let v = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = next()
      const rhs = parseTerm()
      v = op === '+' ? v + rhs : v - rhs
    }
    return v
  }

  const value = parseExpr()
  if (pos < tokens.length && !failed) failed = 'error'

  if (failed === 'incomplete') return { value: null, error: null, incomplete: true }
  if (failed === 'error') return { value: null, error: 'Invalid expression', incomplete: false }
  if (!Number.isFinite(value)) return { value: null, error: 'Invalid expression', incomplete: false }

  // Money: round to cents.
  return { value: Math.round(value * 100) / 100, error: null, incomplete: false }
}

/** True when the string is a calculation (has an operator beyond a leading minus). */
export function isExpression(input) {
  const s = String(input ?? '').trim()
  return /[+*/×÷()]|.-|.−/.test(s)
}
