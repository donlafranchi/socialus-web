// Magic-link-only auth (T111). One field, one button — Supabase's
// signInWithOtp creates the user when the email is unknown
// (shouldCreateUser defaults to true), so sign-up and sign-in are one flow.
'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { safeNext } from '@/lib/safe-next'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function MagicLinkForm({ next }: { next?: string | null }) {
  const { signInWithOtp } = useAuth()
  const nextSafe = safeNext(next)

  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setError('Enter a valid email address.')
      return
    }
    setSubmitting(true)
    const { error: err } = await signInWithOtp(value, nextSafe)
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    setSentTo(value)
  }

  if (sentTo) {
    return (
      <div className="w-full text-center" data-testid="magic-sent-message">
        <h1 className="mb-3 text-2xl font-semibold">Check your email</h1>
        <p className="mb-6 text-sm text-neutral-600">
          We sent a sign-in link to <strong>{sentTo}</strong>. Open it on this device to finish — no password needed.
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null)
            setError(null)
          }}
          className="text-sm text-[var(--color-accent)] underline"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold" data-testid="login-heading">
        Sign in to SocialUs
      </h1>
      <p className="mb-5 text-sm text-neutral-600">
        Enter your email and we’ll send you a link. No password — new here or not, this is the way in.
      </p>
      <form onSubmit={handleSubmit} className="w-full space-y-3" data-testid="magic-link-form">
      <input
        type="email"
        required
        autoFocus
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className="input"
        data-testid="email-input"
      />
      {error && (
        <p data-testid="auth-error" className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        data-testid="submit-button"
        className="w-full rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
      >
        {submitting ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      </form>
    </>
  )
}
