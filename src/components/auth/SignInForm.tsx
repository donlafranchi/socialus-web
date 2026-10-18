// One way in (the PM, 2026-10-18): your email, then the 6-digit code we email you. The same
// email carries a one-tap link as a convenience. signInWithOtp creates the account when the email
// is new, so sign-up and sign-in are one flow. Precedent: Slack, Notion and Substack.
'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { safeNext } from '@/lib/safe-next'
import { rememberedEmail, rememberEmail } from '@/lib/auth/remembered-email'
import { Button } from '@/components/ui/Button'
import { CodeEntry, CODE_LENGTH } from './CodeEntry'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Supabase allows one email a minute per address: a second tap means a code is already on its way.
const isRateLimit = (message: string) => /rate|too many|security purposes|seconds/i.test(message)

export function SignInForm({ next, initialError = null }: { next?: string | null; initialError?: string | null }) {
  const { signInWithOtp } = useAuth()
  const nextSafe = safeNext(next)

  const [email, setEmail] = useState(rememberedEmail)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const value = email.trim()
    if (!EMAIL_RE.test(value)) return setError('Enter a valid email address.')
    setSubmitting(true)
    const { error: err } = await signInWithOtp(value, nextSafe)
    setSubmitting(false)
    if (err && !isRateLimit(err.message)) return setError('We couldn’t send the code. Check the email address and try again.')
    rememberEmail(value)
    setNotice(err ? 'We just sent a code to this address. Use the one in your inbox.' : null)
    setSentTo(value)
  }

  if (sentTo) {
    return (
      <div className="w-full" data-testid="code-sent">
        <h1 className="mb-2 text-title-1 text-[var(--color-fg)]">Check your email</h1>
        <p className="mb-5 text-body-sm text-[var(--color-fg-muted)]">
          Enter the {CODE_LENGTH}-digit code we sent to <strong>{sentTo}</strong>. Or tap the link in that email.
        </p>
        <CodeEntry
          email={sentTo}
          next={nextSafe}
          // A full load, so the server renders with the new session cookie.
          onDone={(to) => window.location.assign(to)}
          initialNotice={notice}
          onResend={() => signInWithOtp(sentTo, nextSafe)}
          onChangeEmail={() => {
            setSentTo(null)
            setError(null)
          }}
        />
      </div>
    )
  }

  return (
    <>
      <h1 className="mb-2 text-title-1 text-[var(--color-fg)]" data-testid="login-heading">
        Sign in to SocialUs
      </h1>
      <p className="mb-5 text-body-sm text-[var(--color-fg-muted)]">
        Enter your email and we’ll send you a {CODE_LENGTH}-digit code. New here or not, this is the way in.
      </p>
      <form onSubmit={handleSubmit} className="w-full space-y-3" data-testid="sign-in-form">
        <label htmlFor="sign-in-email" className="block text-body-sm font-medium text-[var(--color-fg)]">
          Email
        </label>
        <input
          id="sign-in-email"
          type="email"
          name="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input min-h-tap"
          data-testid="email-input"
        />
        {error && (
          <p data-testid="auth-error" className="text-body-sm text-[var(--color-danger,#b00)]" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} data-testid="submit-button" className="w-full">
          {submitting ? 'Sending…' : 'Email me a code'}
        </Button>
      </form>
    </>
  )
}
