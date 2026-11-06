'use client'

// #1094 — who you are, top right of the header. A small mark that opens /you;
// signed out it says "Sign in". Sign-out lives on /you.

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { PersonMark } from '@/components/PersonMark'

export function YouAvatar() {
  const { user, loading } = useAuth()
  if (loading) return <span aria-hidden="true" className="size-tap" />
  if (!user) {
    return (
      <Link
        href="/auth/login"
        data-testid="you-signin"
        className="inline-flex min-h-tap items-center rounded-full px-3 text-body-sm font-medium text-[var(--color-charcoal-900)] hover:bg-neutral-100"
      >
        Sign in
      </Link>
    )
  }
  return (
    <Link
      href="/you"
      aria-label="You"
      data-testid="you-avatar"
      className="inline-flex size-tap items-center justify-center rounded-full hover:bg-neutral-100"
    >
      <PersonMark name={user.email ?? 'You'} className="h-8 w-8" />
    </Link>
  )
}
