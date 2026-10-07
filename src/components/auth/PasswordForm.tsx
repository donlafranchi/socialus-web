'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { offerToSaveLogin } from '@/lib/auth/save-login'
import { Button } from '@/components/ui/Button'

const MIN = 8

export function PasswordForm({ email }: { email: string }) {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN) return setError(`Use at least ${MIN} characters.`)
    setSaving(true)
    const { error: err } = await updatePassword(password)
    setSaving(false)
    if (err) return setError(err.message)
    await offerToSaveLogin(email, password)
    setPassword('')
    setSaved(true)
  }

  if (saved) {
    return (
      <div data-testid="password-saved">
        <h1 className="text-title-1 text-[var(--color-fg)]">Password saved</h1>
        <p className="mt-2 text-body-sm text-[var(--color-fg-muted)]">
          Next time, sign in with your email and this password, or with an emailed link.
        </p>
        <Button href="/you" className="mt-5 w-full">
          Back to You
        </Button>
      </div>
    )
  }

  return (
    <>
      <h1 className="text-title-1 text-[var(--color-fg)]">Password</h1>
      <p className="mt-2 mb-5 text-body-sm text-[var(--color-fg-muted)]">
        Set a password to sign in without waiting for an email. The emailed link still works.
      </p>
      <form onSubmit={handleSubmit} className="w-full space-y-3" data-testid="password-form">
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
        <input
          type="password"
          name="new-password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`New password, at least ${MIN} characters`}
          aria-label="New password"
          className="input"
          data-testid="new-password-input"
        />
        {error && (
          <p data-testid="password-error" className="text-body-sm text-[var(--color-danger,#b00)]" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={saving} data-testid="save-password" className="w-full">
          {saving ? 'Saving…' : 'Save password'}
        </Button>
      </form>
      <Link href="/you" className="press mt-3 inline-flex min-h-tap items-center text-body-sm font-medium text-[var(--color-accent)]">
        Back to You
      </Link>
    </>
  )
}
