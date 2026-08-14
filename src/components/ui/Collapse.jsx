/**
 * Smooth expand/collapse for content whose height isn't known in advance
 * (form sections, toggle reveals) — no JS height measurement needed.
 *
 * Uses the CSS grid-template-rows 0fr/1fr trick: the outer grid row animates
 * between a 0 and content-sized track, and the inner `overflow-hidden` div
 * clips everything (border included) while collapsed, so nothing peeks
 * through mid-transition. Children stay mounted (so the transition can run
 * both ways) — just visually and non-interactively hidden while closed.
 */
export default function Collapse({ open, children }) {
  return (
    <div
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows] duration-300 ease-out ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}
