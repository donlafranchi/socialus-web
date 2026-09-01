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
        {initialError && (
          <p className="mb-4 text-sm text-red-600" role="alert">
            {initialError}
          </p>
        )}
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
