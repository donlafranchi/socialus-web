'use client'

// F118 criteria 4 and 5 — add a maker you love, then send them the link to claim it free.

import { useState } from 'react'
import { addMakerAction, type AddMakerResult } from '@/app/_actions/open-actions'
import { KIND_LABELS, MAKER_KINDS, type MakerKind } from '@/lib/open/towns'
import { buttonClass } from '@/components/ui/Button'
import { InviteButton } from './InviteButton'

const control = 'mt-1.5 w-full rounded-md border border-[var(--color-control-border)] bg-[var(--color-bg)] px-3 py-2.5 text-body'
const label = 'text-body-sm font-medium text-[var(--color-fg)]'

export const CLAIM_INVITE = 'Claim your free Page on SocialUs'

const REFUSED: Record<Exclude<AddMakerResult, { ok: true }>['reason'], string> = {
  signed_out: 'Sign in to add a maker.',
  link: 'Use their own website or a social profile, not a review site or a map.',
  limit: 'That’s 10 today. Add more tomorrow.',
  failed: 'That didn’t go through. Mind trying again?',
}

export function AddMaker({ townSlug, townName, places }: { townSlug: string; townName: string; places: string[] }) {
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [link, setLink] = useState('')
  const [kind, setKind] = useState<MakerKind | ''>('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ kind: 'added' | 'exists'; publicId: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!kind) return
    setBusy(true)
    setError(null)
    const r = await addMakerAction({ townSlug, place: place || undefined, name, link, kind })
    setBusy(false)
    if (!r.ok) return setError(REFUSED[r.reason])
    setDone({ kind: r.kind, publicId: r.publicId, name: name.trim() })
    setName('')
    setLink('')
    setKind('')
  }

  if (done) {
    return (
      <div data-testid="maker-added" className="rounded-lg border border-[var(--color-border)] p-4">
        <p className="text-body font-semibold text-[var(--color-fg)]">
          {done.kind === 'added' ? `${done.name} is on SocialUs.` : `${done.name} is already on SocialUs.`}
        </p>
        <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]">Send them the link. When they claim it, they count toward {townName}’s makers.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <InviteButton label="Send the link" title={CLAIM_INVITE} text={`${CLAIM_INVITE}:`} path={`/g/${done.publicId}`} variant="primary" />
          <a href={`/g/${done.publicId}`} className={buttonClass('secondary', 'md')}>See the Page</a>
        </div>
        <button type="button" onClick={() => setDone(null)} className="mt-3 text-body-sm text-[var(--color-accent-text)] underline">Add another</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="add-maker">
      <div>
        <label htmlFor="mk-name" className={label}>Name</label>
        <input id="mk-name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={control} />
      </div>
      {places.length > 1 && (
        <div>
          <label htmlFor="mk-place" className={label}>Town</label>
          <select id="mk-place" value={place} onChange={(e) => setPlace(e.target.value)} className={control}>
            <option value="">Somewhere in {townName}</option>
            {places.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="mk-link" className={label}>Their website or social profile</label>
        <input id="mk-link" required inputMode="url" autoCapitalize="none" placeholder="bluebirdbakery.com" value={link} onChange={(e) => setLink(e.target.value)} className={control} />
      </div>
      <div>
        <label htmlFor="mk-kind" className={label}>What kind</label>
        <select id="mk-kind" required value={kind} onChange={(e) => setKind(e.target.value as MakerKind)} className={control}>
          <option value="" disabled>Pick one</option>
          {MAKER_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="text-body-sm text-[var(--color-danger)]">{error}</p>}
      <button type="submit" disabled={busy} className={`${buttonClass('primary', 'md')} w-full`}>{busy ? 'Adding…' : 'Add'}</button>
    </form>
  )
}
