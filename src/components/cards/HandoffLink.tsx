'use client'

// #555 — a card's link. On the press, it hands the Page what the card already knows (name, kind, photo), so the
// Page's loading shell can show them at once, and it reads the whole Page ahead of a tap that is about to happen
// (hover, focus, touch). Otherwise it is next/link, prefetching the loading shell as the card comes into view.

import Link from 'next/link'
import { useState, type ComponentProps } from 'react'
import { stashCardForPage, type CardHandoff } from '@/lib/browse/card-handoff'

export function HandoffLink({ handoff, href, prefetch, onPointerDown, onClick, onMouseEnter, onFocus, onTouchStart, ...rest }: ComponentProps<typeof Link> & { handoff?: CardHandoff }) {
  // Prefetch on view is the router's default (the loading shell); intent (hover, focus, a finger resting) reads the whole Page.
  const [intent, setIntent] = useState(false)
  const hand = () => {
    if (handoff && typeof href === 'string') stashCardForPage(href, handoff)
  }
  return (
    <Link
      {...rest}
      href={href}
      prefetch={intent ? true : prefetch}
      onMouseEnter={(e) => {
        setIntent(true)
        onMouseEnter?.(e)
      }}
      onFocus={(e) => {
        setIntent(true)
        onFocus?.(e)
      }}
      onTouchStart={(e) => {
        setIntent(true)
        onTouchStart?.(e)
      }}
      onPointerDown={(e) => {
        hand()
        onPointerDown?.(e)
      }}
      onClick={(e) => {
        hand()
        onClick?.(e)
      }}
    />
  )
}
