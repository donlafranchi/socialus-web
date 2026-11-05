'use client'

// #1183 — Explore's rows of posts from members, one per kind, under "From neighbors"; a row holds only these, never
// Pages' posts (#1154). Search shows the same, as one group. Draft words.

import { ShelfRow } from '@/components/browse/ShelfRow'
import { MemberPostCard } from './MemberPostCard'
import { KIND_LABEL, MEMBER_POST_KINDS } from '@/lib/member-posts/kinds'
import type { MemberPost } from '@/lib/member-posts/read'

export const FROM_NEIGHBORS = 'From neighbors'

export function MemberPostRows({ posts, byKind = true, now = new Date() }: { posts: readonly MemberPost[]; byKind?: boolean; now?: Date }) {
  if (posts.length === 0) return null
  const render = (p: MemberPost) => <MemberPostCard post={p} now={now} />
  return (
    <section data-testid="member-post-rows" aria-label={byKind ? FROM_NEIGHBORS : undefined}>
      {byKind ? (
        <>
          <h2 className="mt-4 text-lg font-semibold text-[var(--color-charcoal-900)]">{FROM_NEIGHBORS}</h2>
          {MEMBER_POST_KINDS.map((k) => (
            <ShelfRow key={k} testId={`member-posts-${k}`} title={KIND_LABEL[k]} size="post" items={posts.filter((p) => p.kind === k)} keyOf={(p) => p.id} renderItem={render} />
          ))}
        </>
      ) : (
        <ShelfRow testId="member-posts-search" title={FROM_NEIGHBORS} size="post" items={posts} keyOf={(p) => p.id} renderItem={render} />
      )}
    </section>
  )
}
