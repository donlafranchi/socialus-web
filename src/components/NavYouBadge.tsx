'use client'

// F086 (thin front) — the badge, wired to auth and the router.
//
// Split from YouBadge so the badge itself stays a pure, testable thing: this
// is the only part that reaches for the session, and it is the part a unit
// test cannot say much about.
//
// `members.display_name` is not on the auth user, so it is read once here.
// A failed read is not fatal — the badge falls back to the handle and then to
// "Signed in", because saying something true and vague beats rendering an
// empty box that looks broken.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { YouBadge } from './YouBadge'

export function NavYouBadge() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const [me, setMe] = useState<{ display_name: string | null; handle: string | null; avatar_url: string | null } | null>(null)

  useEffect(() => {
    // No synchronous setState on the signed-out path: a stale `me` is ignored
    // at render instead (see `profile` below). Clearing it here is a cascading
    // render, which the lint rule is right about.
    if (!user) return
    let cancelled = false
    createClient()
      .from('members')
      .select('display_name, handle, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setMe(data ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // The row belongs to whoever is signed in now. After a sign-out the effect
  // does not run, so `me` may still hold the last person; gating on `user`
  // here is what makes that impossible to render.
  const profile = user ? me : null

  return (
    <YouBadge
      loading={loading}
      displayName={user ? (profile?.display_name ?? '') : null}
      handle={profile?.handle ?? null}
      photoUrl={profile?.avatar_url ?? null}
      signOut={signOut}
      onSignedOut={() => router.refresh()}
    />
  )
}
