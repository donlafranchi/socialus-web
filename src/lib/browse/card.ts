// T156 — a browse row as a card.
//
// Result cards render Pages, not Items: name, tags, photo, location — not
// title / price / kind. The name on the card is the PAGE's name on both kinds
// of row, including a post's, because F059 criterion 9 asks every result to
// carry "the name the people behind it are actually known by" and a post
// detached from whoever posted it fails that.
//
// The location scale is read conservatively. `browse_feed` returns a label and
// a point, not `locations.kind`, so this cannot tell a street address from an
// area the way `own-pages.ts` can — it has the row that names the kind. A
// labelled location is shown as what it says; an unlabelled one falls back to
// `metro`, which is true by construction because the query is metro-scoped.
// Never `online`: that is a deliberate answer a creator gave, and no column
// here carries it.

import type { CardLocation } from '@/components/cards'
import type { BrowseResult } from '@/lib/feed/browse-feed'

export function browseCardLocation(r: BrowseResult): CardLocation {
  const label = r.locationLabel?.trim()
  return label ? { scale: 'address', label } : { scale: 'metro' }
}

/** The line under the name: a post says its own words, a Page says its blurb. */
export function browseCardTagline(r: BrowseResult): string | null {
  return r.resultKind === 'post' ? r.body : r.description
}
