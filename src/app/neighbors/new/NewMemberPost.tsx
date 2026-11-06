'use client'

import { useRouter } from 'next/navigation'
import { MemberPostComposer } from '@/components/member-posts/MemberPostComposer'
import { createMemberPostAction } from '@/app/_actions/member-post-actions'
import { searchNeighborhoodsAction } from '@/app/_actions/location-actions'
import { memberPostHref } from '@/lib/member-posts/kinds'

export function NewMemberPost({ needsPhone, phoneOpen }: { needsPhone: boolean; phoneOpen: boolean }) {
  const router = useRouter()
  return (
    <MemberPostComposer
      needsPhone={needsPhone}
      phoneOpen={phoneOpen}
      onPost={async (draft) => {
        const r = await createMemberPostAction(draft)
        return r.ok ? { ok: true, postId: r.postId } : { ok: false, message: r.message }
      }}
      onPosted={(id) => router.push(memberPostHref(id))}
      searchNeighborhoods={async (q) => {
        const r = await searchNeighborhoodsAction(q)
        return r.ok ? r.data : []
      }}
    />
  )
}
