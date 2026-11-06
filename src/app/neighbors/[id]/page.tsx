// #1183 — one post from a member. Signed-in readers only; an ended one only its poster still reads.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { readMemberPosts } from '@/lib/member-posts/read'
import { memberPostHref } from '@/lib/member-posts/kinds'
import { MemberPostScreen } from './MemberPostScreen'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function MemberPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/auth/login?next=${encodeURIComponent(memberPostHref(id))}`)
  const [post] = await readMemberPosts(supabase, { postId: id })
  if (!post) notFound()
  return (
    <main className="mx-auto w-full max-w-form gutter py-8 pb-dock">
      <MemberPostScreen post={post} />
    </main>
  )
}
