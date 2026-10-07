// Sign-in (T111): the emailed link is the way in, and signInWithOtp creates
// the user when the email is unknown, so sign-up and sign-in are one flow.
// #407 — a password works alongside it, for anyone who has set one on You
// (the PM, 2026-10-05; Slack, Notion and Supabase's dashboard do the same).
'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { safeNext } from '@/lib/safe-next'
import { rememberedEmail, rememberEmail } from '@/lib/auth/remembered-email'
import { offerToSaveLogin } from '@/lib/auth/save-login'
import { Button } from '@/components/ui/Button'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEXT_LINK = 'press min-h-tap text-body-sm font-medium text-[var(--color-accent)] underline'

type Mode = 'link' | 'password'

export function MagicLinkForm({ next }: { next?: string | null }) {
  const { signInWithOtp, signIn, resetPassword } = useAuth()
  const nextSafe = safeNext(next)

  const [mode, setMode] = useState<Mode>('link')
  const [email, setEmail] = useState(rememberedEmail)
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState<{ to: string; kind: 'link' | 'reset' } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validEmail(): string | null {
    const value = email.trim()
    if (EMAIL_RE.test(value)) return value
    setError('Enter a valid email address.')
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const value = validEmail()
    if (!value) return
    if (mode === 'password' && !password) {
      setError('Enter your password.')
      return
    }
    setSubmitting(true)
    if (mode === 'link') {
      const { error: err } = await signInWithOtp(value, nextSafe)
      setSubmitting(false)
      if (err) return setError(err.message)
      rememberEmail(value)
      setSent({ to: value, kind: 'link' })
      return
    }
    const { error: err } = await signIn(value, password)
    if (err) {
      setSubmitting(false)
      return setError('That email and password don’t match. Try again, or reset your password.')
    }
    rememberEmail(value)
    await offerToSaveLogin(value, password)
    // A full load, so the server renders with the new session cookie.
    window.location.assign(nextSafe)
  }

  async function handleForgot() {
    setError(null)
    const value = validEmail()
    if (!value) return
    setSubmitting(true)
    const { error: err } = await resetPassword(value)
    setSubmitting(false)
    if (err) return setError(err.message)
    rememberEmail(value)
    setSent({ to: value, kind: 'reset' })
  }

  function switchTo(to: Mode) {
    setMode(to)
    setError(null)
    setPassword('')
  }

  if (sent) {
    return (
      <div className="w-full text-center" data-testid="magic-sent-message">
        <h1 className="mb-3 text-title-1 text-[var(--color-fg)]">Check your email</h1>
        <p className="mb-6 text-body-sm text-[var(--color-fg-muted)]">
          {sent.kind === 'link' ? (
            <>We sent a sign-in link to <strong>{sent.to}</strong>. Open it on this device to finish.</>
          ) : (
            <>We sent a link to <strong>{sent.to}</strong>. Open it on this device to choose a new password.</>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(null)
            setError(null)
          }}
          className={TEXT_LINK}
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <>
      <h1 className="mb-2 text-title-1 text-[var(--color-fg)]" data-testid="login-heading">
        Sign in to SocialUs
      </h1>
      <p className="mb-5 text-body-sm text-[var(--color-fg-muted)]">
        {mode === 'link'
          ? 'Enter your email and we’ll send you a link. New here or not, this is the way in.'
          : 'Enter the email and password you set on You.'}
      </p>
      <form onSubmit={handleSubmit} className="w-full space-y-3" data-testid="magic-link-form">
        <input
          type="email"
          name="email"
          required
          autoFocus
          autoComplete={mode === 'password' ? 'username' : 'email'}
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          className="input"
          data-testid="email-input"
        />
        {mode === 'password' && (
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className="input"
            data-testid="password-input"
          />
        )}
        {error && (
          <p data-testid="auth-error" className="text-body-sm text-[var(--color-danger,#b00)]" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} data-testid="submit-button" className="w-full">
          {mode === 'link' ? (submitting ? 'Sending…' : 'Email me a sign-in link') : submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4">
        {mode === 'link' ? (
          <button type="button" onClick={() => switchTo('password')} className={TEXT_LINK} data-testid="use-password">
            Use a password instead
          </button>
        ) : (
          <>
            <button type="button" onClick={handleForgot} disabled={submitting} className={TEXT_LINK} data-testid="forgot-password">
              Forgot password?
            </button>
            <button type="button" onClick={() => switchTo('link')} className={TEXT_LINK} data-testid="use-link">
              Email me a link instead
            </button>
          </>
        )}
      </div>
    </>
  )
}
