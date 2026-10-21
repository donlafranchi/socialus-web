'use client'

// #987 — claim a Page yourself: a code to the business's own email domain or listed phone, and the Page is
// yours at once. With neither, a link as proof goes to an operator.

import { useEffect, useState } from 'react'
import { COPY } from '@/lib/copy'
import type { ClaimChoices, ClaimFailure, ClaimResult } from '@/app/_actions/claim-actions'

export interface ClaimHandlers {
  choices: (groupId: string) => Promise<ClaimChoices | null>
  start: (input: { groupId: string; method: 'email' | 'phone'; email?: string }) => Promise<ClaimResult<{ claimId: string; sentTo: string }>>
  verify: (input: { claimId: string; code: string; pagePath: string }) => Promise<ClaimResult>
  proof: (input: { groupId: string; proofUrl: string; note?: string }) => Promise<ClaimResult>
}

interface Props {
  groupId: string
  pagePath: string
  loggedIn: boolean
  handlers: ClaimHandlers
  onDone: (message: string) => void
}

const FAILURE: Record<ClaimFailure, string> = {
  signed_out: COPY.claimSignIn,
  taken: COPY.claimTaken,
  limit: COPY.unclaimedLimit,
  wrong_code: COPY.claimWrongCode,
  expired: COPY.claimExpired,
  failed: COPY.unclaimedFailed,
}

export function ClaimForm({ groupId, pagePath, loggedIn, handlers, onDone }: Props) {
  const [choices, setChoices] = useState<ClaimChoices | null>(null)
  const [sent, setSent] = useState<{ claimId: string; sentTo: string; method: 'email' | 'phone'; email?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (loggedIn) void handlers.choices(groupId).then(setChoices)
  }, [loggedIn, groupId, handlers])

  if (!loggedIn) {
    return (
      <a href={`/auth/login?next=${encodeURIComponent(pagePath)}`} className="btn-primary self-start">
        {COPY.claimSignIn}
      </a>
    )
  }
  if (!choices) return null

  async function run<T>(call: () => Promise<ClaimResult<T>>, then: (r: { ok: true } & T) => void) {
    setBusy(true)
    setError(null)
    const r = await call()
    setBusy(false)
    if (r.ok) then(r)
    else setError(FAILURE[r.reason])
  }

  const start = (method: 'email' | 'phone', email?: string) =>
    run(() => handlers.start({ groupId, method, ...(email ? { email } : {}) }), (r) => setSent({ claimId: r.claimId, sentTo: r.sentTo, method, email }))

  const alert = error && (
    <p role="alert" className="text-sm text-red-700">
      {error}
    </p>
  )

  if (sent) {
    return (
      <form
        data-testid="claim-code-form"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          const code = String(new FormData(e.currentTarget).get('code') ?? '').trim()
          void run(() => handlers.verify({ claimId: sent.claimId, code, pagePath }), () => onDone(COPY.claimDone))
        }}
      >
        <p className="text-sm">{COPY.claimCodeSentTo(sent.sentTo)}</p>
        <label className="flex flex-col gap-1 text-sm">
          {COPY.claimCodeLabel}
          <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} className="input" />
        </label>
        {alert}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="btn-primary">
            {COPY.claimConfirm}
          </button>
          <button type="button" disabled={busy} className="btn-secondary" onClick={() => void start(sent.method, sent.email)}>
            {COPY.claimResend}
          </button>
        </div>
      </form>
    )
  }

  if (choices.proof) {
    return (
      <form
        data-testid="claim-proof-form"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const note = String(f.get('note') ?? '').trim()
          void run(
            () => handlers.proof({ groupId, proofUrl: String(f.get('proofUrl') ?? '').trim(), note: note || undefined }),
            () => onDone(COPY.claimProofSent),
          )
        }}
      >
        <p className="text-sm">{COPY.claimProofIntro}</p>
        <label className="flex flex-col gap-1 text-sm">
          {COPY.claimProofLabel}
          <input name="proofUrl" type="url" required pattern="https://.*" maxLength={500} className="input" placeholder="https://" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {COPY.claimProofNote}
          <textarea name="note" maxLength={1000} rows={2} className="input" />
        </label>
        {alert}
        <button type="submit" disabled={busy} className="btn-primary self-start">
          {COPY.claimProofSend}
        </button>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{COPY.claimIntro}</p>
      {choices.emailDomain && (
        <form
          data-testid="claim-start-form"
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const local = String(new FormData(e.currentTarget).get('local') ?? '').trim()
            void start('email', `${local}@${choices.emailDomain}`)
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            {COPY.claimEmailLabel(choices.emailDomain)}
            <span className="flex items-center gap-1">
              <input name="local" required maxLength={64} pattern="[^@\s]+" autoComplete="off" className="input min-w-0 flex-1" />
              <span className="shrink-0 text-sm">@{choices.emailDomain}</span>
            </span>
          </label>
          <button type="submit" disabled={busy} className="btn-primary self-start">
            {COPY.claimEmailSend}
          </button>
        </form>
      )}
      {choices.phone && (
        <button type="button" disabled={busy} className={`${choices.emailDomain ? 'btn-secondary' : 'btn-primary'} self-start`} onClick={() => void start('phone')}>
          {COPY.claimPhoneSend(choices.phone)}
        </button>
      )}
      {alert}
    </div>
  )
}
