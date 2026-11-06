// #316 — a Page's labels as links that open Explore filtered by that label. Shown only where labels are (signed
// in: the front door has none). #896 — quiet text links, not pills (Don, 2026-10-18: no chips anywhere).
// #1180 — plain words from the shared list, no # (members never type hashtags, 2026-10-12).

import Link from 'next/link'
import { normalizeTag } from '@/lib/groups/tags'
import { picksFromTags } from '@/lib/labels/match'

export function TagLinks({ tags: given }: { tags: readonly string[] }) {
  // In the list's order, each top label before its finer ones.
  const tags = picksFromTags(given)
  if (tags.length === 0) return null
  return (
    <ul data-testid="tag-chips" className="flex flex-wrap gap-x-4">
      {tags.map((t) => (
        <li key={t}>
          <Link
            href={`/explore?category=${encodeURIComponent(normalizeTag(t))}`}
            className="press inline-flex min-h-11 items-center text-body-sm font-medium text-[var(--color-accent)] hover:underline"
          >
            {t}
          </Link>
        </li>
      ))}
    </ul>
  )
}
