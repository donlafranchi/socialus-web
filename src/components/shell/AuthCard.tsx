// #303 — T7 Auth (L17–L20): the wordmark, then one 400-wide card centred on
// the surface; nav and footer are hidden on these routes (BottomNav NO_NAV).
// Precedent: Luma's and Airbnb's email-first sign-in.

import Link from 'next/link'
import type { ReactNode } from 'react'

export function AuthCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-[var(--color-surface)] gutter py-10">
      <Link href="/" className="mb-8 text-title-2 text-[var(--color-accent)] hover:no-underline">
        SocialUs
      </Link>
      <div data-testid={testId} className="w-full max-w-auth rounded-lg bg-[var(--color-bg)] p-6 shadow-sm">
        {children}
      </div>
    </main>
  )
}
