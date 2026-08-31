'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { MagicLinkForm } from '@/components/auth/MagicLinkForm'

function LoginInner() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const initialError = searchParams.get('error')

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold" data-testid="login-heading">
          Sign in to SocialUs
        </h1>
        <p className="mb-5 text-sm text-neutral-600">
          Enter your email and we’ll send you a link. No password — new here or not, this is the way in.
        </p>

        {initialError && <p className="mb-4 text-sm text-red-600">{initialError}</p>}

        <MagicLinkForm next={next} />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  )
}
