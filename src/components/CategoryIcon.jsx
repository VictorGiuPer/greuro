import { getIcon } from '../lib/icons'

/**
 * Rounded-square icon tile: dark fill tinted with the category color, with the
 * lucide glyph drawn in that same color. Used in transaction rows and the form.
 */
export default function CategoryIcon({ name, color = '#818CF8', size = 44 }) {
  const Icon = getIcon(name)
  const glyph = Math.round(size * 0.5)
  return (
    <div
      className="flex items-center justify-center rounded-tile shrink-0 border border-hairline"
      style={{
        width: size,
        height: size,
        backgroundColor: `${color}1F`, // ~12% tint of the category color
      }}
    >
      <Icon size={glyph} color={color} strokeWidth={2} />
    </div>
  )
}
