'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { MagicLinkForm } from '@/components/auth/MagicLinkForm'
import { AuthCard } from '@/components/shell/AuthCard'

function LoginInner() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const initialError = searchParams.get('error')

  return (
    <AuthCard testId="auth-card">
      {initialError && (
        <p className="mb-4 text-body-sm text-[var(--color-danger,#b00)]" role="alert">
          {initialError}
        </p>
      )}
      <MagicLinkForm next={next} />
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
