// #316 — tags as familiar hashtags: #tag chips that open Explore filtered by
// that tag. Shown only where tags are (signed in: the front door has none).

import Link from 'next/link'
import { normalizeTag } from '@/lib/groups/tags'

/** "Local food" → "#Localfood": how people write a hashtag. Display only;
 *  search goes by the tag's normalized form. */
export const hashtag = (label: string) => `#${label.replace(/^#+/, '').replace(/\s+/g, '')}`

export function TagChips({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null
  return (
    <ul data-testid="tag-chips" className="flex flex-wrap gap-2">
      {tags.map((t) => (
        <li key={t}>
          <Link
            href={`/explore?category=${encodeURIComponent(normalizeTag(t))}`}
            className="press inline-flex min-h-8 items-center rounded-full bg-[var(--color-surface)] px-3 text-caption font-medium text-[var(--color-charcoal-900)] hover:bg-[var(--color-charcoal-100)]"
          >
            {hashtag(t)}
          </Link>
        </li>
      ))}
    </ul>
  )
}
