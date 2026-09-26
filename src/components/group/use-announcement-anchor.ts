'use client'

// bug #211, generalised by F093 — arrive on the announcement you tapped.
//
// Lifted out of `PagePosts` when the signed-out Page gained its own list
// (F093 criterion 9). Two surfaces now render announcements a fragment can
// name — one with bodies for a member, one withheld for a stranger — and an
// `#announcement-<id>` link has to land the same way on both. Two copies of
// this effect is how they stop landing the same way.

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
export function useAnnouncementAnchor(): string | null {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const arrived = useRef(false)

  useEffect(() => {
    if (arrived.current) return
    const id = announcementIdFromHash(window.location.hash)
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
  }, [])

  return highlighted
}

/** The classes that mark one announcement as the one you tapped. A ring
 *  rather than a background: it says "this one" without restyling the
 *  announcement into something that looks like a different kind of thing. */
export const ANNOUNCEMENT_MARK = ' ring-2 ring-[var(--color-accent)] ring-offset-2'
