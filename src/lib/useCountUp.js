import { useEffect, useRef, useState } from 'react'

/**
 * Gentle count-up for dashboard numbers: eases from the previously shown
 * value to `target` (~600ms, cubic ease-out). Under prefers-reduced-motion it
 * jumps straight to the target.
 */
export default function useCountUp(target, duration = 600) {
  const [value, setValue] = useState(0)
  const prevRef = useRef(0)

  useEffect(() => {
    const from = prevRef.current
    prevRef.current = target
    if (from === target) {
      setValue(target)
      return
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}
