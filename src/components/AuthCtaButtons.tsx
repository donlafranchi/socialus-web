'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasActiveBusinessGroup } from '@/lib/member/hasActiveBusinessGroup'

function defaultSupabaseFactory(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

/** unknown = not yet resolved, or the lookup failed. Both suppress the CTA. */
type SellerStatus = 'unknown' | 'seller' | 'not-seller'

/**
 * Auth-aware CTAs. Shows "Log in" + "List your business" when signed out;
 * when signed in, shows the CTA only to Members who do not already run a Shop.
 *
 * The Shop check reads active kind='business' Group memberships. It used to
 * read the retired `businesses` table, which failed silently and left the CTA
 * showing to every signed-in Member — see
 * planning/backlog/audit-vendor-market-retirement.md § 1.3.
 *
 * NOTE: the CTA still points at /join → /register-vendor, a funnel that is
 * itself being retired. Where it points next is an open PM decision (audit
 * § 3.4, blocked on the printed-QR durability question); only the audience
 * bug is fixed here.
 */
export function AuthCtaButtons({
  variant = 'default',
  supabaseFactory,
}: {
  variant?: 'default' | 'compact'
  /** Test seam; production leaves it undefined. Mirrors SellCta's convention. */
  supabaseFactory?: () => SupabaseClient
}) {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [seller, setSeller] = useState<SellerStatus>('unknown')

  useEffect(() => {
    const client = (supabaseFactory ?? defaultSupabaseFactory)()
    let cancelled = false

    const checkSeller = async (uid: string | undefined) => {
      if (!uid) {
        if (!cancelled) setSeller('not-seller')
        return
      }
      try {
        const isSeller = await hasActiveBusinessGroup(client, uid)
        if (!cancelled) setSeller(isSeller ? 'seller' : 'not-seller')
      } catch {
        // Fail closed. Showing "List your business" to someone who already
        // runs one is the worse error, and a silent failure here is exactly
        // what shipped the bug.
        if (!cancelled) setSeller('unknown')
      }
    }

    client.auth.getUser().then(({ data }) => {
      if (cancelled) return
      setAuthed(!!data.user)
      checkSeller(data.user?.id)
    })
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      setAuthed(!!session?.user)
      setSeller('unknown')
      checkSeller(session?.user?.id)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [supabaseFactory])

  if (authed === null) return null

  if (authed) {
    if (seller !== 'not-seller') return null
    return (
      <Link href="/join" className="text-sm font-medium text-neutral-700 hover:text-neutral-900">
        List your business <span aria-hidden>→</span>
      </Link>
    )
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/auth/login"
          data-testid="signup-link"
          className="inline-flex items-center rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <Link
        href="/join"
        className="text-sm font-medium text-neutral-700 hover:text-neutral-900"
      >
        List your business <span aria-hidden>→</span>
      </Link>
      <Link
        href="/auth/login"
        data-testid="signup-link"
        className="inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-hover)] shadow-sm"
      >
        Sign in
      </Link>
    </div>
  )
}
