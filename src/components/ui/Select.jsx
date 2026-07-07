const ADD_NEW = '__add_new__'

/**
 * Dark-styled native select wrapper. Value is coerced to string for the DOM.
 * When `onAddNew` is provided, a trailing "＋ Add new…" option opens a
 * quick-create form instead of selecting a value.
 */
export default function Select({ value, onChange, options, placeholder, onAddNew, ariaLabel }) {
  function handleChange(e) {
    const v = e.target.value
    if (v === ADD_NEW) {
      onAddNew?.()
      return // don't change the selection to the sentinel
    }
    onChange(v)
  }
  return (
    <select
      value={value === '' || value == null ? '' : String(value)}
      onChange={handleChange}
      aria-label={ariaLabel}
      className="w-full appearance-none rounded-2xl border border-hairline bg-elevated px-4 py-3 text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239BA1AC' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 14px center',
      }}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.value} value={String(o.value)}>
          {o.label}
        </option>
      ))}
      {onAddNew && <option value={ADD_NEW}>＋ Add new…</option>}
    </select>
  )
}
