// #316 — tags as familiar hashtags: #tag links that open Explore filtered by
// that tag. Shown only where tags are (signed in: the front door has none).
// #896 — quiet text links, not pills (Don, 2026-10-18: no chips anywhere).

import Link from 'next/link'
import { normalizeTag } from '@/lib/groups/tags'

/** "Local food" → "#Localfood": how people write a hashtag. Display only;
 *  search goes by the tag's normalized form. */
export const hashtag = (label: string) => `#${label.replace(/^#+/, '').replace(/\s+/g, '')}`

export function TagChips({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null
  return (
    <ul data-testid="tag-chips" className="flex flex-wrap gap-x-4">
      {tags.map((t) => (
        <li key={t}>
          <Link
            href={`/explore?category=${encodeURIComponent(normalizeTag(t))}`}
            className="press inline-flex min-h-11 items-center text-body-sm font-medium text-[var(--color-accent)] hover:underline"
          >
            {hashtag(t)}
          </Link>
        </li>
      ))}
    </ul>
  )
}
