'use client'

// bug #211 — arrive on the announcement you tapped, signed in or out (F134.8).

import { useEffect, useRef, useState } from 'react'
import { announcementAnchor, announcementIdFromHash } from './announcement-anchor'

/**
 * The announcement the URL fragment names, once it is on the page.
 *
 * The browser's own fragment scrolling is not enough: these lists live in
 * client components below a server component, so the element does not exist
 * until hydration and by then the browser has stopped looking.
 *
 * Returns the id to mark, or null.
 */
/** `focusId` — the post a post's own address names (Don, 2026-10-31); a fragment still wins. */
export function useAnnouncementAnchor(key?: unknown, focusId?: string | null): string | null {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const arrived = useRef(false)

  useEffect(() => {
    if (arrived.current) return
    const id = announcementIdFromHash(window.location.hash) ?? focusId ?? null
    if (!id) return
    const el = document.getElementById(announcementAnchor(id))
    if (!el) return
    arrived.current = true

    // AFTER PAINT, not synchronously. Two reasons and both are real:
    //
    // `scrollIntoView` needs layout, and inside the effect the list has been
    // committed but the browser has not painted it, so a scroll computed here
    // can land on the wrong offset — which is precisely the failure this whole
    // bug is about, one layer down.
    //
    // And a synchronous setState in an effect cascades a second render before
    // paint. The React Compiler lint says so, and #119 is the standing record
    // of what suppressing that rule costs, so this obeys it rather than
    // silencing it.
    const frame = requestAnimationFrame(() => {
      setHighlighted(id)
      // Optional call, and not only for jsdom. THE MARK IS WHAT IDENTIFIES THE
      // ANNOUNCEMENT; the scroll is an aid. An environment without
      // `scrollIntoView` still lands on a Page where the right announcement is
      // ringed — whereas a throw here would take the highlight down with it,
      // which is exactly what it did the first time.
      el.scrollIntoView?.({ behavior: 'auto', block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
    // `key` re-looks once a list that was folded away opens (#462).
  }, [key, focusId])

  return highlighted
}

