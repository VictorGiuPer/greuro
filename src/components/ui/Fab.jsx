import { Plus } from 'lucide-react'

/**
 * Floating action button, anchored bottom-right of the centered 430px column,
 * floating above the tab bar. The most glowing element on screen (shadow-fab).
 */
export default function Fab({ onClick, label }) {
  return (
    <div className="pointer-events-none fixed bottom-0 left-1/2 z-30 mx-auto h-0 w-full max-w-[430px] -translate-x-1/2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="pointer-events-auto absolute bottom-24 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-black shadow-fab transition-transform active:scale-95"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>
    </div>
  )
}
