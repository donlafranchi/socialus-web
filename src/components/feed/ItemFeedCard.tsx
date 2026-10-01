// T088 — Locality feed card (F030). Presentational; kind-aware.
// T118 — The media block renders unconditionally: photo when present, kind
// field when not (Decision A, 2026-09-04). See design-language.md § Card
// media block. The card declares no width — three grids render it at three
// different column counts, and the merged Home surface may use a fourth.
import Link from 'next/link'
import {
  CalendarDays,
  Flag,
  Gift,
  HandHeart,
  Handshake,
  Lightbulb,
  Package,
  type LucideIcon,
} from 'lucide-react'
import type { FeedItem } from '@/lib/feed/locality-feed'
import { itemHref, kindLabel } from '@/lib/feed/item-url'
import { cardImageAlt } from '@/lib/calendar/ics'

/** items.kind → placeholder glyph. Fixed in design-language.md § Card media block. */
const KIND_GLYPHS: Record<string, { icon: LucideIcon; name: string }> = {
  gathering: { icon: CalendarDays, name: 'calendar-days' },
  product: { icon: Package, name: 'package' },
  service: { icon: Handshake, name: 'handshake' },
  wonder: { icon: Lightbulb, name: 'lightbulb' },
  offer: { icon: Gift, name: 'gift' },
  ask: { icon: HandHeart, name: 'hand-heart' },
  initiative: { icon: Flag, name: 'flag' },
}

const FALLBACK_GLYPH = KIND_GLYPHS.product

export function ItemFeedCard({ item }: { item: FeedItem }) {
  const href = itemHref({
    kind: item.kind,
    ownerHandle: item.ownerHandle,
    title: item.title,
    itemId: item.itemId,
    groupSlug: item.groupSlug,
    groupPlacePath: item.groupPlacePath,
  })
  // #253 — a card names no seller; a business's brand label is the Page speaking.
  const owner = item.brandLabel
  const photo = item.photoUrl?.trim() || null
  const glyph = KIND_GLYPHS[item.kind] ?? FALLBACK_GLYPH
  const Glyph = glyph.icon

  return (
    <Link
      href={href}
      className="card card-hover flex h-full flex-col border border-[var(--color-border)]"
      data-testid="feed-item-card"
    >
      <div
        className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-[var(--color-surface)]"
        data-testid="feed-item-media"
      >
        {photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo}
            alt={cardImageAlt({ title: item.title, place: item.nearestLocationLabel })}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            data-testid="feed-item-photo"
          />
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center text-[var(--color-fg-muted)]"
            data-testid="feed-item-placeholder"
            data-glyph={glyph.name}
            aria-hidden="true"
          >
            <Glyph size={28} strokeWidth={1.5} />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fg-muted)]"
          data-testid="feed-item-kind"
        >
          {kindLabel(item.kind)}
        </span>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold text-[var(--color-fg)]">
          {item.title}
        </h3>
        {owner && (
          <p data-testid="feed-item-owner" className="mt-1 truncate text-sm text-[var(--color-fg-muted)]">
            {owner}
          </p>
        )}
        {item.nearestLocationLabel && (
          <p className="mt-0.5 truncate text-[13px] text-[var(--color-fg-muted)]">
            {item.nearestLocationLabel}
          </p>
        )}
      </div>
    </Link>
  )
}
