'use client'

// F081 — a member is verified as a person by a text-message code to their
// phone, at signup (Don, 2026-10-01). The phone goes on the login only
// (auth.users), which no member or visitor can read.

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { normalizeUsPhone } from '@/lib/auth/phone'
import { COPY } from '@/lib/copy'
import { AuthCard } from '@/components/shell/AuthCard'

type Result = { ok: true } | { ok: false; message: string }

export interface PhoneAuth {
  sendCode: (phone: string) => Promise<Result>
  verifyCode: (phone: string, code: string) => Promise<Result>
}

const supabaseAuth: PhoneAuth = {
  async sendCode(phone) {
    const { error } = await createClient().auth.updateUser({ phone })
    return error ? { ok: false, message: error.message } : { ok: true }
  },
  async verifyCode(phone, token) {
    const { error } = await createClient().auth.verifyOtp({ phone, token, type: 'phone_change' })
    return error ? { ok: false, message: error.message } : { ok: true }
  },
}

export function PhoneVerifyStep({ auth = supabaseAuth, onVerified }: { auth?: PhoneAuth; onVerified: () => void }) {
  const [raw, setRaw] = useState('')
  const [phone, setPhone] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const normalized = normalizeUsPhone(raw)
    if (!normalized) {
      setError(COPY.phoneInvalid)
      return
    }
    setError(null)
    setBusy(true)
    const res = await auth.sendCode(normalized)
    setBusy(false)
    if (!res.ok) {
      setError(COPY.phoneSendFailed)
      return
    }
    setPhone(normalized)
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !phone) return
    setError(null)
    setBusy(true)
    const res = await auth.verifyCode(phone, code.trim())
    setBusy(false)
    if (!res.ok) {
      setError(COPY.phoneCodeWrong)
      return
    }
    onVerified()
  }

  const errorLine = error && (
    <p role="alert" data-testid="phone-error" className="text-body-sm text-[var(--color-danger,#b00)]">
      {error}
    </p>
  )

  return (
    <AuthCard>
      {phone === null ? (
        <form data-testid="phone-form" onSubmit={send} className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-title-1 text-[var(--color-fg)]">{COPY.phoneTitle}</h1>
            <p className="text-body-sm text-[var(--color-fg-muted)]">{COPY.phoneWhy}</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="phone-number" className="text-sm font-medium">
              Phone number
            </label>
            <input
              id="phone-number"
              data-testid="phone-number"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              className="input"
              placeholder="(916) 555-0134"
              autoFocus
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value)
                setError(null)
              }}
            />
            {errorLine}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-75"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Text me a code
          </button>
        </form>
      ) : (
        <form data-testid="code-form" onSubmit={verify} className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-title-1 text-[var(--color-fg)]">{COPY.phoneCodeTitle}</h1>
            <p className="text-body-sm text-[var(--color-fg-muted)]">{COPY.phoneCodeSent}</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="phone-code" className="text-sm font-medium">
              Code
            </label>
            <input
              id="phone-code"
              data-testid="phone-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="input tracking-widest"
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''))
                setError(null)
              }}
            />
            {errorLine}
          </div>
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-75"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify
          </button>
          <button
            type="button"
            onClick={() => {
              setPhone(null)
              setCode('')
              setError(null)
            }}
            className="press inline-flex min-h-11 w-full items-center justify-center text-sm text-[var(--color-fg-muted)] underline"
          >
            Use a different number
          </button>
        </form>
      )}
    </AuthCard>
  )
}
