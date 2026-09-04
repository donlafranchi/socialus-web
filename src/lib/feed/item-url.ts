// T088 — Item URL + label maps for the locality feed (F030).
// T119 — Canonical URLs (F054). Two decisions live here, both from
// playbooks/PLATFORM-PATTERNS.md:
//
//   1. An Item filed under a Group resolves at its Group place-path
//      (/p/<…place>/g/<group>/<seg>/<slug>-<id8>); an Item with no Group
//      filing resolves at its Member path (/m/<handle>/<seg>/<slug>-<id8>).
//      The id8 fragment is the durable key — no resolver reads the slug or
//      the place segments, so names may change, collide, or be re-scoped
//      without breaking a link that has already been shared.
//
//   2. BROWSABLE_KINDS is the single list of kinds a browse surface may link.
//      A kind with no detail page is withheld everywhere rather than linked
//      to a 404 or to a page that cannot do what the kind is for. One list,
//      one edit to reverse.

import { toSlug } from '@/lib/slugify'

/** items.kind → URL resource segment (CLAUDE.md § Naming conventions). */
export const KIND_SEGMENTS: Record<string, string> = {
  product: 'p',
  service: 's',
  gathering: 'e',
  wonder: 'i',
  offer: 'o',
  ask: 'a',
  initiative: 'initiative',
}

/** items.kind → user-facing UI label (no umbrella "Item" word). */
export const KIND_LABELS: Record<string, string> = {
  product: 'Product',
  service: 'Service',
  gathering: 'Event',
  wonder: 'Idea',
  offer: 'Offer',
  ask: 'Ask',
  initiative: 'Initiative',
}

/**
 * The kinds a browse surface may link. A kind earns a place here when it has
 * a detail page that resolves — not when its schema exists. `wonder` has its
 * child table but no page, so it is withheld with the three T2 kinds; see the
 * T119 DEVIATIONS entry, which records the divergence from item.md's T1 tier.
 */
export const BROWSABLE_KINDS = ['product', 'service', 'gathering'] as const

export type BrowsableKind = (typeof BROWSABLE_KINDS)[number]

/** Unknown kinds are withheld, not admitted — a new kind is invisible until listed. */
export function isBrowsableKind(kind: string): boolean {
  return (BROWSABLE_KINDS as readonly string[]).includes(kind)
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? 'Item'
}

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export interface ItemHrefArgs {
  kind: string
  ownerHandle: string
  title: string
  itemId: string
  /** Filed Group's slug. With groupPlacePath, selects the Group canonical path. */
  groupSlug?: string | null
  /** Slash-joined place path for the Group's anchor Location, no leading slash. */
  groupPlacePath?: string | null
}

export function itemHref(args: ItemHrefArgs): string {
  const seg = KIND_SEGMENTS[args.kind] ?? 'p'
  const base = toSlug(args.title) || args.kind
  const slug = `${base}-${args.itemId.slice(0, 8)}`

  // Group canonical path. Both halves are required: a Group whose anchor
  // Location has no Place (locations.place_id is nullable) has no canonical
  // place path, and a half-built /p//g/… would be malformed rather than
  // merely imprecise. Degrade to the Member path, which always resolves.
  const groupSlug = present(args.groupSlug)
  const placePath = present(args.groupPlacePath)?.replace(/^\/+|\/+$/g, '')
  if (groupSlug && placePath) {
    return `/p/${placePath}/g/${groupSlug}/${seg}/${slug}`
  }

  return `/m/${args.ownerHandle}/${seg}/${slug}`
}
