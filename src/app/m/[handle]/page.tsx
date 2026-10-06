// #303 — there is no public member profile (Don, 2026-10-01: "You is private
// … You currently isn't visible to anyone else"). /m/[handle] is retired: the
// member themself lands on You, and everyone else, signed in or out, gets
// not-found, so the URL never says whether a member exists. The item routes
// under it (/m/[handle]/e|p|s) are untouched.

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'

interface Props {
  params: Promise<{ handle: string }>
}

export const metadata: Metadata = { title: 'Not found — SocialUs', robots: { index: false, follow: false } }

export default async function MemberPage({ params }: Props) {
  const { handle } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data: me } = await supabase.from('members').select('handle').eq('id', user.id).maybeSingle()
    if ((me as { handle: string | null } | null)?.handle === handle) redirect('/you')
  }
  notFound()
}
