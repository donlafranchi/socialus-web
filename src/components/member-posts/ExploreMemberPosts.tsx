// #1183 — Explore's rows of posts from members, for the signed-in reader, streamed like the shelves (F121).

import { createClient } from '@/lib/supabase-server'
import { readMemberPosts } from '@/lib/member-posts/read'
import type { BrowseScope } from '@/lib/feed/browse-feed'
import { MemberPostRows } from './MemberPostRows'

export async function ExploreMemberPosts({ scope }: { scope: BrowseScope }) {
  const supabase = await createClient()
  const posts = await readMemberPosts(supabase, { scope }).catch((e) => {
    console.error('[explore] member posts failed:', (e as Error).message)
    return []
  })
  if (posts.length === 0) return null
  return (
    <div className="px-3 md:px-6">
      <MemberPostRows posts={posts} />
    </div>
  )
}
