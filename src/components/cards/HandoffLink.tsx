'use client'

// #555 — a card's link. While its navigation is pending it draws the Page's shell from what the card already knows
// (name, kind, photo), so the tap is answered at once, and it reads the whole Page ahead of a tap that is about to
// happen (hover, focus, touch). It is not a route boundary: a draft or missing Page must still answer 404.

import Link, { useLinkStatus } from 'next/link'
import { useState, type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { PageShell } from '@/components/group/PageShell'
import { stashCardForPage, type CardHandoff } from '@/lib/browse/card-handoff'

/** Inside the Link: while its navigation is pending, the Page's shell covers the screen. */
function PendingShell({ handoff, href }: { handoff?: CardHandoff; href: ComponentProps<typeof Link>['href'] }) {
  const { pending } = useLinkStatus()
  if (!pending || !handoff || typeof href !== 'string' || !/^\/g\/[^/#?]+/.test(href) || typeof document === 'undefined') return null
  // On the document, not in the card: the card lifts and clips, and a fixed box inside it would follow.
  return createPortal(
    <div data-testid="page-shell-overlay" className="fixed inset-0 z-40 overflow-hidden bg-[var(--color-bg)]">
      <PageShell card={handoff} />
    </div>,
    document.body,
  )
}

export function HandoffLink({ handoff, href, prefetch, onPointerDown, onClick, onMouseEnter, onFocus, onTouchStart, ...rest }: ComponentProps<typeof Link> & { handoff?: CardHandoff }) {
  // Intent (hover, focus, a finger resting) reads the whole Page; the top cards already ask for it (BrowseSurface).
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
    >
      {rest.children}
      <PendingShell handoff={handoff} href={href} />
    </Link>
  )
}
