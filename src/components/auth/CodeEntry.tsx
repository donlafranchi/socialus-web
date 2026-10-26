'use client'

// The emailed 6-digit code, the one way in (the PM, 2026-10-18). Checked with the email address,
// so it works in any browser and in the installed app, where an emailed link opens elsewhere.

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'

export const CODE_LENGTH = 6
export const RESEND_SECONDS = 60
const TEXT_LINK = 'press min-h-tap text-body-sm font-medium text-[var(--color-accent)] underline disabled:text-[var(--color-fg-muted)] disabled:no-underline'

type Props = {
  email: string
  next: string
  onDone: (next: string) => void
  onResend?: () => Promise<{ error: { message: string } | null }>
  onChangeEmail?: () => void
  initialNotice?: string | null
}

export function CodeEntry({ email, next, onDone, onResend, onChangeEmail, initialNotice = null }: Props) {
  const { verifyEmailCode } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(initialNotice)
  const [wait, setWait] = useState(RESEND_SECONDS)
  const tried = useRef<string | null>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function verify(digits: string) {
    if (digits.length !== CODE_LENGTH) return setError(`Enter the ${CODE_LENGTH} digits from the email.`)
    if (busy) return
    tried.current = digits
    setError(null)
    setNotice(null)
    setBusy(true)
    const { error: err } = await verifyEmailCode(email, digits)
    setBusy(false)
    if (err) {
      // Cleared, so the next six digits submit on their own.
      tried.current = null
      setCode('')
      return setError('That code is wrong or has expired. Check the email, or send a new code.')
    }
    onDone(next)
  }

  function change(value: string) {
    // Typing, pasting "123 456" or a whole line from the email all come down to the digits.
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH)
    setCode(digits)
    if (digits.length === CODE_LENGTH && digits !== tried.current) void verify(digits)
  }

  async function resend() {
    if (!onResend || wait > 0) return
    setError(null)
    setNotice(null)
    setWait(RESEND_SECONDS)
    const { error: err } = await onResend()
    if (err) return setError('We couldn’t send a new code just now. Wait a minute and try again.')
    tried.current = null
    setCode('')
    setNotice('We sent a new code. The old one no longer works.')
  }

  return (
    <div className="w-full" data-testid="code-entry">
      <form onSubmit={(e) => { e.preventDefault(); void verify(code) }} className="w-full space-y-3">
        <label htmlFor="email-code" className="block text-body-sm font-medium text-[var(--color-fg)]">
          {CODE_LENGTH}-digit code
        </label>
        <input
          id="email-code"
          name="code"
          data-testid="code-input"
          value={code}
          onChange={(e) => change(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          autoFocus
          aria-invalid={error ? true : undefined}
          className="input min-h-tap w-full text-center text-title-2 tracking-widest"
        />
        {error && <p role="alert" data-testid="code-error" className="text-body-sm text-[var(--color-danger,#b00)]">{error}</p>}
        {notice && <p role="status" data-testid="code-notice" className="text-body-sm text-[var(--color-fg-muted)]">{notice}</p>}
        <Button type="submit" data-testid="code-submit" disabled={busy} className="w-full">
          {busy ? 'Checking…' : 'Sign in'}
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-x-4">
        {onResend && (
          <button type="button" onClick={resend} disabled={wait > 0} className={`${TEXT_LINK} tabular-nums`} data-testid="resend-code">
            {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
          </button>
        )}
        {onChangeEmail && (
          <button type="button" onClick={onChangeEmail} className={TEXT_LINK} data-testid="change-email">
            Use a different email
          </button>
        )}
      </div>
    </div>
  )
}
