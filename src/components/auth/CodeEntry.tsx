'use client'

// #927 — the emailed 6-digit code. A link opened in a different browser from the one that asked
// for it can't finish a PKCE sign-in; the code can, since it is checked with the email address.

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'

export function CodeEntry({ email, next, onDone }: { email: string; next: string; onDone: (next: string) => void }) {
  const { verifyEmailCode } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const digits = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(digits)) return setError('Enter the 6 digits from the email.')
    setError(null)
    setBusy(true)
    const { error: err } = await verifyEmailCode(email, digits)
    setBusy(false)
    if (err) return setError('That code didn’t work. It may have expired: ask for a new link.')
    onDone(next)
  }

  return (
    <form onSubmit={submit} className="mx-auto mb-6 w-full max-w-xs space-y-3 text-left" data-testid="code-entry">
      <label htmlFor="email-code" className="block text-body-sm text-[var(--color-fg-muted)]">
        Or enter the 6-digit code from the email
      </label>
      <input
        id="email-code"
        data-testid="code-input"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        className="input w-full tracking-widest"
      />
      {error && <p role="alert" className="text-body-sm text-[var(--color-danger)]">{error}</p>}
      <Button type="submit" data-testid="code-submit" disabled={busy} className="w-full">
        {busy ? 'Checking…' : 'Sign in with code'}
      </Button>
    </form>
  )
}
