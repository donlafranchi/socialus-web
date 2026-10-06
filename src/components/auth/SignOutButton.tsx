'use client'

import { useAuth } from '@/hooks/useAuth'

export function SignOutButton() {
  const { signOut } = useAuth()
  return (
    <button
      type="button"
      data-testid="you-sign-out"
      onClick={async () => {
        await signOut()
        window.location.href = '/'
      }}
      className="press min-h-tap text-body-sm font-medium text-[var(--color-fg)] underline"
    >
      Sign out
    </button>
  )
}
