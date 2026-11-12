// #303 — T7 Auth (L17–L20): the wordmark, then one 400-wide card centred on
// the surface; nav and footer are hidden on these routes (BottomNav NO_NAV).
// Precedent: Luma's and Airbnb's email-first sign-in.
// #1271 — the front page's look carries into sign-up (the PM, 2026-11-12): terracotta and Aime,
// through the same `.landing` tokens, so the way in looks like the door it came through.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { aime } from '@/components/landing/landing-shared'

export function AuthCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <main className={`landing ${aime.variable} flex min-h-dvh flex-col items-center gutter py-10 font-[family-name:var(--font-landing)]`}>
      <Link href="/" className="mb-8 text-title-1 font-normal tracking-tight text-[var(--color-ink)] hover:no-underline">
        SocialUs
      </Link>
      <div data-testid={testId} className="w-full max-w-auth rounded-lg bg-[var(--color-bg)] p-6 shadow-sm">
        {children}
      </div>
    </main>
  )
}
