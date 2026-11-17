// #1183 — a post from a member, in a row: its lead line, its words, and who, by display name and avatar. It opens
// the post; the name opens nothing (no public profile, ruled 10-01).

import { COPY } from '@/lib/copy'
import Link from 'next/link'
import { PersonMark } from '@/components/PersonMark'
import { memberPostLead } from '@/lib/member-posts/lead'
import { memberPostHref } from '@/lib/member-posts/kinds'
import type { MemberPost } from '@/lib/member-posts/read'

const SMALL_CAPS = 'text-micro font-semibold uppercase tracking-wider'

export function MemberPostCard({ post, now }: { post: MemberPost; now: Date }) {
  return (
    <Link href={memberPostHref(post.id)} data-testid="member-post-card" className="card group/tile flex h-full flex-col gap-2 p-3">
      <p data-testid="member-post-lead" className={`${SMALL_CAPS} truncate text-[var(--color-fg)]`}>
        {memberPostLead(post, now)}
      </p>
      <p className="line-clamp-3 text-sm leading-5 text-[var(--color-fg)] group-hover/tile:text-[var(--color-accent)]">{post.body}</p>
      <p className="mt-auto flex items-center gap-2 text-caption text-[var(--color-fg-muted)]">
        <PersonMark name={post.displayName ?? COPY.aNeighbor} photoUrl={post.avatarUrl} className="size-6 text-micro" />
        <span data-testid="member-post-name" className="line-clamp-1 font-medium text-[var(--color-fg)]">{post.displayName ?? COPY.aNeighbor}</span>
      </p>
    </Link>
  )
}
