// Page kinds (dispatch, 2026-10-05): a group leads with its next event (Meetup),
// an organization with its upcoming events (Eventbrite organizer pages). Each
// links down to the post itself.

import type { PagePost } from '@/lib/groups/page-posts'
import { upcomingPosts } from '@/lib/groups/page-kind'
import { formatMetroDateTime } from '@/lib/metro/metro-time'
import { announcementAnchor } from './announcement-anchor'

export function NextUp({ posts, heading, limit }: { posts: PagePost[]; heading: string; limit: number }) {
  const next = upcomingPosts(posts).slice(0, limit)
  if (next.length === 0) return null
  return (
    <section data-testid="page-next-up" data-section="next" aria-label={heading} className="card flex flex-col gap-3 border border-[var(--color-border)] p-4">
      <h2 className="text-title-3 text-[var(--color-fg)]">{heading}</h2>
      <ul className="flex flex-col gap-2">
        {next.map((p) => (
          <li key={p.id}>
            <a href={`#${announcementAnchor(p.id)}`} className="card press block p-3">
              <span className="block text-caption font-medium text-[var(--color-fg-muted)]">
                {formatMetroDateTime(p.startsAt!, undefined, undefined, p.endsAt)}
                {p.locationLabel ? ` · ${p.locationLabel}` : ''}
              </span>
              <span className="mt-1 line-clamp-2 block text-body-sm text-[var(--color-fg)]">{p.body}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
