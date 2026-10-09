'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { LANDING } from '@/lib/landing-copy'
import type { LandingWaitlistResult } from '@/app/landing/actions'

const W = LANDING.waitlist
type Submit = (input: { email: string; zip: string; runsSomething: boolean; wouldHelp: boolean }) => Promise<LandingWaitlistResult>

export function LandingWaitlistForm({ onSubmit }: { onSubmit: Submit }) {
  const [email, setEmail] = useState('')
  const [zip, setZip] = useState('')
  const [runs, setRuns] = useState(false)
  const [help, setHelp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<LandingWaitlistResult | null>(null)

  const error = result?.kind === 'error' ? result : null
  const done = result && result.kind !== 'error' ? result : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setResult({ kind: 'error', field: 'email', message: W.errors.email })
    if (!/^\d{5}$/.test(zip.trim())) return setResult({ kind: 'error', field: 'zip', message: W.errors.zip })
    setBusy(true)
    setResult(null)
    try {
      setResult(await onSubmit({ email: email.trim(), zip: zip.trim(), runsSomething: runs, wouldHelp: help }))
    } catch {
      setResult({ kind: 'error', field: null, message: W.errors.failed })
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-lg bg-[var(--color-success-tint)] p-5 text-body text-[var(--color-fg)]">
        <p>{W.done[done.kind]}</p>
        {done.kind === 'open' && (
          <Button href="/auth/login" variant="secondary" className="mt-4">
            Sign up
          </Button>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label={W.email} error={error?.field === 'email' ? error.message : null}>
        {(p) => (
          <input {...p} type="email" autoComplete="email" inputMode="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
      </Field>
      <Field label={W.zip} error={error?.field === 'zip' ? error.message : null}>
        {(p) => (
          <input {...p} type="text" inputMode="numeric" autoComplete="postal-code" maxLength={5} className="input sm:w-40" value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} />
        )}
      </Field>
      <div className="flex flex-col gap-2">
        <Check label={W.runs} checked={runs} onChange={setRuns} />
        <Check label={W.help} checked={help} onChange={setHelp} />
      </div>
      {error && error.field === null && (
        <p role="alert" className="text-caption text-red-700">
          {error.message}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy ? W.busy : W.submit}
      </Button>
      <p className="text-caption text-[var(--color-fg-muted)]">{W.note}</p>
    </form>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-tap cursor-pointer items-center gap-3 text-body-sm text-[var(--color-fg)]">
      <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
