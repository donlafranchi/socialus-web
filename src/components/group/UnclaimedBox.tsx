'use client'

// #353 — the quiet box at the end of an unclaimed Page (Tripadvisor's
// placement): Claim (a contact form for now) and Remove (hides at once).

import { useState } from 'react'
import { COPY } from '@/lib/copy'
import type { UnclaimedResult } from '@/app/_actions/unclaimed-actions'

interface Props {
  groupId: string
  pagePath: string
  /** Offers "Just the photo" when there is one to remove (Don, 2026-10-05). */
  hasPhoto: boolean
  onClaim: (input: { groupId: string; name: string; contact: string; message?: string }) => Promise<UnclaimedResult>
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

export function UnclaimedBox({ groupId, pagePath, hasPhoto, onClaim, onRemove }: Props) {
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
    const result =
      open === 'claim'
        ? await onClaim({ groupId, name: text('name'), contact: text('contact'), message: text('message') || undefined })
        : await onRemove({
            groupId,
            scope,
            contact: text('contact'),
            reason: text('reason') || undefined,
            confirmed: f.get('confirmed') === 'on',
            pagePath,
          })
    setBusy(false)
    if (result.ok)
      setDone(
        open === 'claim' ? COPY.unclaimedClaimSent : scope === 'photo' ? COPY.unclaimedRemovePhotoSent : COPY.unclaimedRemoveSent,
      )
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
          ) : (
            <form
              data-testid={`unclaimed-${open}-form`}
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                void submit(e.currentTarget)
              }}
            >
              {open === 'claim' && (
                <label className="flex flex-col gap-1 text-sm">
                  {COPY.unclaimedClaimName}
                  <input name="name" required maxLength={120} className="input" autoComplete="name" />
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm">
                {COPY.unclaimedContact}
                <input name="contact" required minLength={3} maxLength={200} className="input" autoComplete="email" />
              </label>
              {open === 'claim' ? (
                <label className="flex flex-col gap-1 text-sm">
                  {COPY.unclaimedClaimMessage}
                  <textarea name="message" maxLength={2000} rows={3} className="input" />
                </label>
              ) : (
                <>
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
                </>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy} className="btn-primary self-start">
                {open === 'claim' ? COPY.unclaimedClaimSend : COPY.unclaimedRemoveSend}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  )
}
