'use client'

// #353 — the quiet box at the end of an unclaimed Page (Tripadvisor's
// placement): Claim (self-serve by code, #987) and Remove (hides at once).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClaimForm, type ClaimHandlers } from './ClaimForm'
import { COPY } from '@/lib/copy'
import type { UnclaimedResult } from '@/app/_actions/unclaimed-actions'

interface Props {
  groupId: string
  pagePath: string
  /** Offers "Just the photo" when there is one to remove (Don, 2026-10-05). */
  hasPhoto: boolean
  loggedIn: boolean
  claim: ClaimHandlers
  onRemove: (input: {
    groupId: string
    scope: 'page' | 'photo'
    contact: string
    reason?: string
    confirmed: boolean
    pagePath: string
  }) => Promise<UnclaimedResult>
}

type Open = 'none' | 'claim' | 'remove'

export function UnclaimedBox({ groupId, pagePath, hasPhoto, loggedIn, claim, onRemove }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState<Open>('none')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(form: HTMLFormElement) {
    const f = new FormData(form)
    const text = (k: string) => String(f.get(k) ?? '').trim()
    const scope = f.get('scope') === 'photo' ? 'photo' : 'page'
    setBusy(true)
    setError(null)
    const result = await onRemove({
      groupId,
      scope,
      contact: text('contact'),
      reason: text('reason') || undefined,
      confirmed: f.get('confirmed') === 'on',
      pagePath,
    })
    setBusy(false)
    if (result.ok) setDone(scope === 'photo' ? COPY.unclaimedRemovePhotoSent : COPY.unclaimedRemoveSent)
    else setError(result.reason === 'limit' ? COPY.unclaimedLimit : COPY.unclaimedFailed)
  }

  return (
    <section data-testid="unclaimed-box" className="card mt-8 flex flex-col gap-3 p-4">
      <h2 className="text-lg font-medium">{COPY.unclaimedBoxTitle}</h2>
      {done ? (
        <p role="status" data-testid="unclaimed-done" className="text-sm">
          {done}
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600">{COPY.unclaimedBoxBody}</p>
          {open === 'none' ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="unclaimed-claim" className="btn-primary" onClick={() => setOpen('claim')}>
                {COPY.unclaimedClaim}
              </button>
              <button type="button" data-testid="unclaimed-remove" className="btn-secondary" onClick={() => setOpen('remove')}>
                {COPY.unclaimedRemove}
              </button>
            </div>
          ) : open === 'claim' ? (
            <ClaimForm
              groupId={groupId}
              pagePath={pagePath}
              loggedIn={loggedIn}
              handlers={claim}
              onDone={(message) => {
                setDone(message)
                router.refresh()
              }}
            />
          ) : (
            <form
              data-testid="unclaimed-remove-form"
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                void submit(e.currentTarget)
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                {COPY.unclaimedContact}
                <input name="contact" required minLength={3} maxLength={200} className="input" autoComplete="email" />
              </label>
              {hasPhoto && (
                <fieldset className="flex flex-col gap-1 text-sm">
                  <legend className="mb-1">{COPY.unclaimedRemoveWhat}</legend>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="scope" value="page" defaultChecked />
                    {COPY.unclaimedRemoveWholePage}
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="scope" value="photo" />
                    {COPY.unclaimedRemovePhoto}
                  </label>
                </fieldset>
              )}
              <label className="flex flex-col gap-1 text-sm">
                {COPY.unclaimedRemoveReason}
                <textarea name="reason" maxLength={1000} rows={2} className="input" />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirmed" required className="mt-1" />
                {COPY.unclaimedRemoveConfirm}
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy} className="btn-primary self-start">
                {COPY.unclaimedRemoveSend}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  )
}
