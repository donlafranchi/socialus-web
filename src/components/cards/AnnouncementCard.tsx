// The announcement card, from the recovered `BulletinFeedCard` (ccbf54d).
//
// Kept: full-width, `p-4` inside the shell rather than a bleeding image; the
// three stacked type sizes — a 12px semibold attribution in the teal accent, a
// 14px semibold title, 14px body clamped to three lines with whitespace
// preserved; the overflow control top-right, outside the link.
//
// The attribution in accent is doing the work a photo does elsewhere: it tells
// you whose voice this is before you read a word. That is why it is the accent
// colour and not muted grey.
//
// Fluid already — it was always full-width. The only change is that it now sits
// in CardGrid like everything else, so a wide screen gets two or three columns
// of announcements rather than one very long line of text.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card } from './Card'

export function AnnouncementCard({
  attribution,
  title,
  body,
  href,
  menu,
}: {
  attribution: string
  title?: string | null
  body: string
  href?: string | null
  menu?: ReactNode
}) {
  const inner = (
    <>
      <p className="text-xs font-semibold text-[var(--color-accent)]">{attribution}</p>
      {title ? <h3 className="text-sm font-semibold text-neutral-900 mt-1">{title}</h3> : null}
      <p className="text-sm text-neutral-700 mt-1 line-clamp-3 whitespace-pre-wrap">{body}</p>
    </>
  )

  return (
    <Card as="li" interactive={Boolean(href)} data-testid="announcement-card" className="p-4 relative">
      <div className="flex items-start justify-between gap-2">
        {href ? (
          <Link href={href} className="min-w-0 flex-1 hover:no-underline">
            {inner}
          </Link>
        ) : (
          <div className="min-w-0 flex-1">{inner}</div>
        )}
        {menu ? <div className="relative shrink-0">{menu}</div> : null}
      </div>
    </Card>
  )
}
