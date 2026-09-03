'use client'

import { useEffect, useState } from 'react'

/** Viewport shrink (px) that reads as a virtual keyboard rather than browser chrome. */
export const KEYBOARD_MIN_INSET = 150

/**
 * True while the virtual keyboard is up, inferred from the visual viewport.
 *
 * iOS keeps innerHeight fixed and shrinks the visual viewport, so the gap opens
 * and the nav hides. Android shrinks both, so the gap stays closed — there the
 * layout viewport itself has already moved the nav clear of the keyboard.
 * Platforms without visualViewport report false and follow scroll alone.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const check = () => setOpen(window.innerHeight - viewport.height > KEYBOARD_MIN_INSET)
    check()

    viewport.addEventListener('resize', check)
    return () => viewport.removeEventListener('resize', check)
  }, [])

  return open
}
