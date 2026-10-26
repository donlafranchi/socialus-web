'use client'

// F117 — a Wonder on its post card. Everyone who can see the post sees the bar and the accepted helpers;
// a visitor says I'm in (with a size) or offers to help; the Page's managers see the split, who is in and
// every offer, and accept or decline. What reaches this component is already only what the viewer may see.

import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { COPY } from '@/lib/copy'
import { WONDER_ROLES, WONDER_NOTE_MAX, type WonderRole } from '@/lib/wonders/roles'
import type { WonderView } from '@/lib/wonders/wonder-view'

type Fail = { ok: false; message?: string }
export interface WonderActions {
  join: (input: { postId: string; option: string | null }) => Promise<{ ok: true; inCount: number } | Fail>
  leave: (input: { postId: string }) => Promise<{ ok: true; inCount: number } | Fail>
  offer: (input: { postId: string; roles: WonderRole[]; note: string | null }) => Promise<{ ok: true; offerIds: string[] } | Fail>
  withdraw: (input: { offerId: string }) => Promise<{ ok: true; withdrawn: boolean } | Fail>
  decide: (input: { offerId: string; decision: 'accepted' | 'declined' }) => Promise<{ ok: true } | Fail>
}

const TRY_AGAIN = "That didn't go through. Mind trying again?"
const LINK = 'press inline-flex min-h-tap items-center px-1 text-xs underline'
const CHIP = 'press inline-flex min-h-tap items-center rounded-full border border-[var(--color-border)] px-3 text-body-sm'

export function WonderPanel({
  postId,
  view: initial,
  loggedIn,
  canManage,
  returnTo,
  actions,
}: {
  postId: string
  view: WonderView
  loggedIn: boolean
  canManage: boolean
  returnTo: string
  actions: WonderActions
}) {
  const [view, setView] = useState(initial)
  // A fresh view from the server replaces what this card changed locally.
  const [prev, setPrev] = useState(initial)
  if (initial !== prev) {
    setPrev(initial)
    setView(initial)
  }
  const [picking, setPicking] = useState(false)
  const [size, setSize] = useState<string | null>(initial.mine?.option ?? null)
  const [helping, setHelping] = useState(false)
  const [roles, setRoles] = useState<WonderRole[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const pct = Math.min(100, Math.round((view.total / Math.max(1, view.threshold)) * 100))
  const hasSizes = view.options.length > 0

  async function run<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true)
    setStatus(null)
    const r = await fn().catch(() => ({ ok: false }) as unknown as T)
    setBusy(false)
    if (!r.ok) {
      setStatus((r as unknown as Fail).message || TRY_AGAIN)
      return null
    }
    return r
  }

  const join = async (option: string | null) => {
    const r = await run(() => actions.join({ postId, option }))
    if (!r || !('inCount' in r)) return
    setPicking(false)
    setView({ ...view, total: r.inCount, mine: { option } })
  }
  const leave = async () => {
    const r = await run(() => actions.leave({ postId }))
    if (!r || !('inCount' in r)) return
    setSize(null)
    setView({ ...view, total: r.inCount, mine: null })
  }
  const offer = async () => {
    if (roles.length === 0) {
      setStatus(COPY.wonderHelpPickRole)
      return
    }
    const ordered = WONDER_ROLES.filter((x) => roles.includes(x))
    const r = await run(() => actions.offer({ postId, roles: ordered, note: note.trim() || null }))
    if (!r || !('offerIds' in r)) return
    const kept = view.myOffers.filter((o) => !ordered.includes(o.role))
    const made = ordered.map((role, i) => view.myOffers.find((o) => o.role === role) ?? { id: r.offerIds[i]!, role, status: 'pending' as const })
    setView({ ...view, myOffers: [...kept, ...made] })
    setHelping(false)
    setRoles([])
    setNote('')
    setStatus(COPY.wonderHelpSent)
  }
  const withdraw = async (offerId: string) => {
    const r = await run(() => actions.withdraw({ offerId }))
    if (r) setView({ ...view, myOffers: view.myOffers.filter((o) => o.id !== offerId) })
  }
  const decide = async (offerId: string, decision: 'accepted' | 'declined') => {
    const r = await run(() => actions.decide({ offerId, decision }))
    if (!r) return
    const offers = (view.offers ?? []).map((o) => (o.id === offerId ? { ...o, status: decision } : o))
    const helpers = offers.filter((o) => o.status === 'accepted').map((o) => ({ name: o.name, role: o.role }))
    setView({ ...view, offers, helpers })
  }

  return (
    <div className="mt-3 flex flex-col gap-3" data-testid="wonder-panel">
      <div>
        <div
          role="progressbar"
          aria-label={COPY.wonderBarLabel}
          aria-valuemin={0}
          aria-valuemax={view.threshold}
          aria-valuenow={view.total}
          className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-charcoal-100)]"
        >
          <div data-testid="wonder-bar-fill" className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 flex flex-wrap gap-x-2 text-body-sm">
          <span data-testid="wonder-count" className="font-semibold text-[var(--color-fg)]">
            {COPY.wonderCount(view.total, view.threshold)}
          </span>
          {view.total >= view.threshold && <span className="text-[var(--color-fg-muted)]">{COPY.wonderReached}</span>}
        </p>
      </div>

      {view.helpers.length > 0 && (
        <p data-testid="wonder-helpers" className="text-body-sm text-[var(--color-fg)]">
          <span className="font-semibold">{COPY.wonderHelpers}: </span>
          {view.helpers.map((h) => `${h.name} · ${COPY.wonderRoles[h.role]}`).join(', ')}
        </p>
      )}

      {!canManage && (
        <div className="flex flex-col gap-2">
          {!loggedIn ? (
            <a href={`/auth/login?next=${encodeURIComponent(returnTo)}`} className="btn-primary self-start">
              {COPY.wonderImIn}
            </a>
          ) : view.mine && !picking ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm font-semibold text-[var(--color-fg)]">{COPY.wonderYoureIn(view.mine.option)}</span>
              {hasSizes && (
                <button type="button" className={LINK} disabled={busy} onClick={() => setPicking(true)}>
                  {COPY.wonderChangeSize}
                </button>
              )}
              <button type="button" className={LINK} disabled={busy} onClick={leave}>
                {COPY.wonderLeave}
              </button>
            </div>
          ) : picking ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-body-sm font-semibold text-[var(--color-fg)]">{COPY.wonderPickSize}</legend>
              <div className="flex flex-wrap gap-2">
                {view.options.map((o) => (
                  <label key={o} className={`${CHIP} cursor-pointer has-[:checked]:border-[var(--color-accent)] has-[:checked]:font-semibold`}>
                    <input type="radio" name={`wonder-size-${postId}`} value={o} checked={size === o} onChange={() => setSize(o)} className="sr-only" />
                    {o}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary disabled:opacity-50" disabled={busy || !size} onClick={() => join(size)}>
                  {COPY.wonderJoinSave}
                </button>
                <button type="button" className={LINK} onClick={() => setPicking(false)}>
                  Cancel
                </button>
              </div>
            </fieldset>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={busy} onClick={() => (hasSizes ? setPicking(true) : join(null))}>
                {COPY.wonderImIn}
              </button>
            </div>
          )}

          {loggedIn && (
            <button type="button" className={`${LINK} self-start`} onClick={() => setHelping(true)}>
              {COPY.wonderHelp}
            </button>
          )}

          {view.myOffers.length > 0 && (
            <div data-testid="wonder-my-offers" className="text-body-sm">
              <p className="font-semibold text-[var(--color-fg)]">{COPY.wonderYourOffers}</p>
              <ul className="mt-1 flex flex-col">
                {view.myOffers.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 text-[var(--color-fg)]">
                    {COPY.wonderRoles[o.role]} · <span className="text-[var(--color-fg-muted)]">{COPY.wonderStatus[o.status]}</span>
                    {o.status === 'pending' && (
                      <button type="button" className={LINK} disabled={busy} onClick={() => withdraw(o.id)}>
                        {COPY.wonderWithdraw}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {canManage && (
        <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] p-3 text-body-sm">
          {view.byOption && view.byOption.length > 0 && (
            <p data-testid="wonder-sizes" className="text-[var(--color-fg)]">
              <span className="font-semibold">{COPY.wonderSizes}: </span>
              {view.byOption.map((b) => `${b.option}: ${b.count}`).join(' · ')}
            </p>
          )}
          <details data-testid="wonder-people">
            <summary className="press min-h-tap cursor-pointer font-semibold text-[var(--color-fg)]">
              {COPY.wonderPeople} ({view.people?.length ?? 0})
            </summary>
            {view.people && view.people.length > 0 ? (
              <ul className="mt-1 flex flex-col text-[var(--color-fg)]">
                {view.people.map((p, i) => (
                  <li key={i}>{p.option ? `${p.name} · ${p.option}` : p.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[var(--color-fg-muted)]">{COPY.wonderNobodyYet}</p>
            )}
          </details>
          <div data-testid="wonder-offers">
            <p className="font-semibold text-[var(--color-fg)]">{COPY.wonderOffers}</p>
            {view.offers && view.offers.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-1">
                {view.offers.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-2 text-[var(--color-fg)]">
                    <span>
                      {o.name} · {COPY.wonderRoles[o.role]}
                      {o.note ? <span className="text-[var(--color-fg-muted)]"> — {o.note}</span> : null}
                    </span>
                    {o.status === 'pending' ? (
                      <>
                        <button type="button" className={LINK} disabled={busy} onClick={() => decide(o.id, 'accepted')}>
                          {COPY.wonderAccept}
                        </button>
                        <button type="button" className={LINK} disabled={busy} onClick={() => decide(o.id, 'declined')}>
                          {COPY.wonderDecline}
                        </button>
                      </>
                    ) : (
                      <span className="text-[var(--color-fg-muted)]">{COPY.wonderStatus[o.status]}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[var(--color-fg-muted)]">{COPY.wonderNobodyYet}</p>
            )}
          </div>
        </div>
      )}

      <span role="status" className="text-xs text-[var(--color-fg-muted)]">
        {status}
      </span>

      <Sheet
        open={helping}
        title={COPY.wonderHelpTitle}
        onClose={() => setHelping(false)}
        testId="wonder-help-sheet"
        footer={
          <button type="button" className="btn-primary w-full disabled:opacity-50" disabled={busy} onClick={offer}>
            {COPY.wonderHelpSend}
          </button>
        }
      >
        <div className="flex flex-col gap-3 pb-2">
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">{COPY.wonderHelpTitle}</legend>
            {WONDER_ROLES.map((r) => (
              <label key={r} className="flex min-h-tap items-center gap-3 text-body-sm">
                <input
                  type="checkbox"
                  checked={roles.includes(r)}
                  onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))}
                  className="size-5"
                />
                {COPY.wonderRoles[r]}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-body-sm">
            {COPY.wonderHelpNote}
            <input
              type="text"
              value={note}
              maxLength={WONDER_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-tap rounded border border-[var(--color-control-border)] px-3"
            />
          </label>
        </div>
      </Sheet>
    </div>
  )
}
