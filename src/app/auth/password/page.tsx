// Password auth for automated checks only: unlinked, and no member has a password to use here.
// Members have one way in, the emailed code at /auth/login (the PM, 2026-10-18). This stays
// because the Playwright evals and the live smoke test sign in builder accounts without an
// inbox. Remove once they establish sessions programmatically.
'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { EmailFirstSignup } from '@/components/auth/EmailFirstSignup'
import { safeNext } from '@/lib/safe-next'

function PasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'), '/onboarding')

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-5 text-2xl font-semibold" data-testid="password-auth-heading">
          Sign in with a password
        </h1>
        <EmailFirstSignup
          next={next}
          onAuthenticated={(to) => router.push(safeNext(to, '/onboarding'))}
        />
      </div>
    </div>
  )
}

export default function PasswordAuthPage() {
  return (
    <Suspense>
      <PasswordInner />
    </Suspense>
  )
}
