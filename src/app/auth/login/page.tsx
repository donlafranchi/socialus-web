'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SignInForm } from '@/components/auth/SignInForm'
import { LINK_FAILED } from '@/lib/auth/link-failed'
import { AuthCard } from '@/components/shell/AuthCard'

function LoginInner() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  // Only our own words: the query string is anyone's to write.
  const initialError = searchParams.get('error') ? LINK_FAILED : null

  return (
    <AuthCard testId="auth-card">
      <SignInForm next={next} initialError={initialError} />
    </AuthCard>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  )
}
