/**
 * Shared bottom-sheet primitive: scrim + slide-up card with drag-handle bar.
 * Content scrolls inside; the sheet honours the bottom safe-area inset.
 */
export default function Sheet({ open, onClose, label, children }) {
  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={open ? undefined : 'true'}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[430px] rounded-t-[24px] border-t border-hairline bg-card transition-transform duration-300 ${
          open ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-h-[88dvh] overflow-y-auto px-5 pb-6 pt-4">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
          {children}
        </div>
      </div>
    </>
  )
}
