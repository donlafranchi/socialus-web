'use client'

// #1183 — post without a Page (plan #270 B): pick a kind, write it, pick the neighborhood. A yard sale may add its
// day and its street, shown only until that day ends. Listed under comes from the shared list (#1180). It is signed
// with the member's display name and the neighborhood, never their own area. Every word is a draft for Don.

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Typeahead } from '@/components/locations/Typeahead'
import { ListedUnder, labelsToSend, UNPINNED, type ListedValue } from '@/components/labels/ListedUnder'
import { KIND_DAYS, KIND_LABEL, MEMBER_POST_KINDS, type MemberPostKind } from '@/lib/member-posts/kinds'
import type { NeighborhoodMatch } from '@/lib/places/neighborhood-search'

const HINT: Record<MemberPostKind, string> = {
  lost_found: 'A pet or something you lost or found.',
  free_sale: 'Something to give away or sell, or a yard sale.',
  ask: 'Ask for a recommendation, or what’s going on.',
}

const PLACEHOLDER: Record<MemberPostKind, string> = {
  lost_found: 'Grey cat, white paws, answers to Miso. Last seen on 24th St.',
  free_sale: 'Free couch on the curb, or a yard sale on Saturday.',
  ask: 'Who fixes old bikes around here?',
}

export interface MemberPostDraft {
  kind: MemberPostKind
  body: string
  placeId: string
  saleOn?: string
  street?: string
  tags: string[]
  labelsPinned: boolean
}

type Sent = { ok: true; postId: string } | { ok: false; message?: string }

export function MemberPostComposer({
  onPost,
  onPosted,
  searchNeighborhoods,
  needsPhone = false,
  phoneOpen = false,
}: {
  onPost: (draft: MemberPostDraft) => Promise<Sent>
  onPosted: (postId: string) => void
  searchNeighborhoods: (q: string) => Promise<NeighborhoodMatch[]>
  needsPhone?: boolean
  /** Phone confirmation is switched on (PHONE_VERIFICATION_REQUIRED): the gate leads to it. */
  phoneOpen?: boolean
}) {
  const [kind, setKind] = useState<MemberPostKind | null>(null)
  const [body, setBody] = useState('')
  const [place, setPlace] = useState<{ id: string; name: string } | null>(null)
  const [saleOn, setSaleOn] = useState('')
  const [street, setStreet] = useState('')
  const [listed, setListed] = useState<ListedValue>(UNPINNED)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (needsPhone) {
    return (
      <div data-testid="member-post-phone" className="flex flex-col gap-3">
        <p className="text-body text-[var(--color-fg)]">Confirm your phone number before you post.</p>
        <p className="text-body-sm text-[var(--color-fg-muted)]">
          One number per person keeps posts from real neighbors.
          {phoneOpen ? '' : ' Confirming a phone number isn’t open yet, so posting without a Page waits for it.'}
        </p>
        {phoneOpen && (
          <Link href="/onboarding" className="btn-primary self-start">
            Confirm my phone
          </Link>
        )}
      </div>
    )
  }

  const ready = kind !== null && body.trim().length > 0 && place !== null && (!street.trim() || saleOn !== '')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || busy || !kind || !place) return
    setBusy(true)
    setError(null)
    const sale = kind === 'free_sale' && saleOn ? { saleOn, ...(street.trim() ? { street: street.trim() } : {}) } : {}
    const sent = await onPost({ kind, body: body.trim(), placeId: place.id, ...sale, ...labelsToSend(listed, { text: body }) }).catch(() => ({ ok: false as const }))
    if (sent.ok) return onPosted(sent.postId)
    setError(('message' in sent && sent.message) || 'That didn’t go through. Try again?')
    setBusy(false)
  }

  return (
    <form onSubmit={submit} data-testid="member-post-composer" className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-body font-semibold text-[var(--color-fg)]">What is it?</legend>
        {MEMBER_POST_KINDS.map((k) => (
          <label
            key={k}
            className={`flex cursor-pointer gap-3 rounded-md border p-4 ${kind === k ? 'border-[var(--color-charcoal-700)]' : 'border-[var(--color-border)]'}`}
          >
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-1" />
            <span className="flex flex-col gap-0.5">
              <span className="text-body font-semibold text-[var(--color-fg)]">{KIND_LABEL[k]}</span>
              <span className="text-body-sm text-[var(--color-fg-muted)]">{HINT[k]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {kind && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-body-sm font-medium text-[var(--color-fg)]">Say what it is</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder={PLACEHOLDER[kind]}
              className="rounded-md border border-[var(--color-border)] p-3 text-body"
            />
          </label>

          {place ? (
            <p data-testid="member-post-place" className="text-body-sm text-[var(--color-fg)]">
              <span className="text-[var(--color-fg-muted)]">Neighborhood: </span>
              {place.name}
              <span aria-hidden> · </span>
              <button type="button" onClick={() => setPlace(null)} className="min-h-tap font-medium text-[var(--color-accent)] hover:underline">
                Change
              </button>
            </p>
          ) : (
            <Typeahead<NeighborhoodMatch>
              label="Neighborhood"
              placeholder="Curtis Park, Midtown…"
              minChars={2}
              search={searchNeighborhoods}
              optionKey={(n) => n.placeId}
              optionLabel={(n) => n.name}
              onPick={(n) => setPlace({ id: n.placeId, name: n.name })}
            />
          )}

          {kind === 'free_sale' && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-body-sm font-medium text-[var(--color-fg)]">A yard sale? Its day (optional)</span>
                <input
                  type="date"
                  value={saleOn}
                  onChange={(e) => {
                    setSaleOn(e.target.value)
                    if (!e.target.value) setStreet('')
                  }} className="min-h-tap rounded-md border border-[var(--color-border)] px-3" />
              </label>
              {saleOn && (
                <label className="flex flex-col gap-1">
                  <span className="text-body-sm font-medium text-[var(--color-fg)]">Street address (optional)</span>
                  <input
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    maxLength={120}
                    autoComplete="street-address"
                    className="min-h-tap rounded-md border border-[var(--color-border)] px-3"
                  />
                  <span className="text-caption text-[var(--color-fg-muted)]">Shown until the sale’s day is over.</span>
                </label>
              )}
            </div>
          )}

          <ListedUnder idPrefix="member-post" value={listed} onChange={setListed} text={body} />

          <p className="text-caption text-[var(--color-fg-muted)]">
            Signed with your name and the neighborhood. It comes down on its own after {KIND_DAYS[kind]} days
            {kind === 'free_sale' ? ', or when the sale’s day is over' : ''}.
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="text-body-sm text-[var(--color-danger,#b00)]">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!ready || busy} data-testid="member-post-submit">
        {busy ? 'Posting…' : 'Post'}
      </Button>
    </form>
  )
}
