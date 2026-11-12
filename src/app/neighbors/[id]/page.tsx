// #1183 — one post from a member; an ended one only its poster still reads. F134: signed out too, without the name.
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { readMemberPosts } from '@/lib/member-posts/read'
import { MemberPostScreen } from './MemberPostScreen'
import { countUse } from '@/lib/usage/count-use'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function MemberPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const [post] = await readMemberPosts(supabase, { postId: id })
  if (!post) notFound()
  // F133 — an Ask a neighbor post is its own part; any other is posts. Counted after the response.
  await countUse({ part: post.kind === 'ask' ? 'ask' : 'posts' }, data.user?.id ?? null)
  return (
    <main className="mx-auto w-full max-w-form gutter py-8 pb-dock">
      <MemberPostScreen post={post} loggedIn={Boolean(data.user)} />
    </main>
  )
}
