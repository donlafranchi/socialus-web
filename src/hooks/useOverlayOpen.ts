'use client'

import { useEffect, useState } from 'react'

// Every modal in the app carries aria-modal; data-nav-pause is the opt-in for
// non-dialog sheets that should still freeze the nav.
const OVERLAY_SELECTOR = '[aria-modal="true"], [data-nav-pause="true"]'

/** True while a modal or bottom sheet is mounted anywhere in the document. */
export function useOverlayOpen(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const check = () => setOpen(document.querySelector(OVERLAY_SELECTOR) !== null)
    check()

    const observer = new MutationObserver(check)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'data-nav-pause'],
    })
    return () => observer.disconnect()
  }, [])

  return open
}
