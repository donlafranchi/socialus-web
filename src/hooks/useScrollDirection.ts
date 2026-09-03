'use client'

import { useEffect, useRef, useState } from 'react'

/** Sustained travel (px) in one direction before the nav flips state (F046). */
export const NAV_SCROLL_THRESHOLD = 20

type ScrollDirectionOptions = {
  threshold?: number
  /** While true, scroll is ignored and the current state is held (overlay open). */
  paused?: boolean
  /** Changing this restores visibility — pass the pathname to reset on tab switch. */
  resetKey?: string | null
}

/**
 * Tracks scroll direction and returns whether the bottom nav should be on screen.
 * Visible at rest, at the top of the page, and after sustained upward travel;
 * hidden after sustained downward travel.
 */
export function useScrollDirection({
  threshold = NAV_SCROLL_THRESHOLD,
  paused = false,
  resetKey = null,
}: ScrollDirectionOptions = {}): boolean {
  const [visible, setVisible] = useState(true)
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  const lastY = useRef(0)
  const travel = useRef(0) // signed distance since the last direction flip
  const pausedRef = useRef(paused)

  useEffect(() => {
    pausedRef.current = paused
    if (paused) travel.current = 0
  }, [paused])

  // Route change restores the nav — adjusted during render so the tab switch
  // never paints a hidden bar. https://react.dev/reference/react/useState
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setVisible(true)
  }

  // Re-anchor the scroll accounting to wherever the new route landed.
  useEffect(() => {
    travel.current = 0
    lastY.current = window.scrollY
  }, [lastResetKey])

  useEffect(() => {
    lastY.current = window.scrollY
    let pending = false
    let frame = 0

    const evaluate = () => {
      pending = false
      const y = Math.max(0, window.scrollY)
      const delta = y - lastY.current
      lastY.current = y

      // Paused: track position so resuming measures fresh travel, not the gap.
      if (pausedRef.current) {
        travel.current = 0
        return
      }
      if (y <= 0) {
        travel.current = 0
        setVisible(true)
        return
      }
      if (delta === 0) return
      // A direction flip restarts the accumulator, so jitter cannot cross the
      // threshold and the nav does not flicker.
      if (Math.sign(delta) !== Math.sign(travel.current)) travel.current = 0
      travel.current += delta

      if (travel.current > threshold) setVisible(false)
      else if (travel.current < -threshold) setVisible(true)
    }

    const onScroll = () => {
      if (pending) return
      pending = true
      frame = requestAnimationFrame(evaluate)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [threshold])

  return visible
}
