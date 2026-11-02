'use client'

// #1171 (socialus-plan #269, Don 2026-11-02) — the Saved list: what a member kept for later. Upcoming first; a dated
// one offers Remind me (the reminders that already exist, nothing new is sent); past ones drop to the end.

import { useState } from 'react'
import Link from 'next/link'
import { RemindMeButton, type RemindActions } from '@/components/reminders/RemindMe'
import { leadLine, cardHeadline } from '@/lib/posts/lead-line'
import { HEART_COPY } from '@/lib/copy'
import { reminderFor, type ViewerReminders } from '@/lib/reminders/viewer-reminders'
import type { SavedPost } from '@/lib/hearts/saved-posts'

type Unsave = (input: { postId: string; on: boolean }) => Promise<{ ok: boolean }>

export function SavedList({ posts, reminders, remind, unsave }: { posts: SavedPost[]; reminders: ViewerReminders; remind: RemindActions; unsave: Unsave }) {
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set())
  const shown = posts.filter((p) => !gone.has(p.postId))
  if (shown.length === 0) return <p data-testid="saved-empty" className="text-body-sm text-[var(--color-fg-muted)]">{HEART_COPY.savedEmpty}</p>
  const current = shown.filter((p) => !p.past)
  const past = shown.filter((p) => p.past)
  const remove = async (postId: string) => {
    setGone(new Set([...gone, postId]))
    const res = await unsave({ postId, on: false }).catch(() => ({ ok: false }))
    if (!res.ok) setGone((g) => new Set([...g].filter((id) => id !== postId)))
  }
  const row = (p: SavedPost) => (
    <li key={p.postId} data-testid="saved-post" className="card border border-[var(--color-border)] p-3">
      <Link href={p.href} className="block">
        <p className="text-micro font-bold uppercase tracking-wider text-[var(--color-fg)]">
          {leadLine({ kind: p.kind, startsAt: p.startsAt, endsAt: p.endsAt, where: p.where })}
        </p>
        <p className="mt-0.5 line-clamp-1 text-body font-semibold text-[var(--color-fg)]">{cardHeadline({ headline: p.headline, body: p.body, pageName: p.pageName })}</p>
        <p className="text-body-sm text-[var(--color-fg-muted)]">{p.pageName}</p>
      </Link>
      <div className="mt-1 flex items-center gap-3">
        {p.startsAt && !p.past && (
          <RemindMeButton postId={p.postId} repeats={!!p.seriesId} reminderId={reminderFor(reminders, { id: p.postId, seriesId: p.seriesId })} loggedIn returnTo="/you/saved" actions={remind} />
        )}
        <button type="button" data-testid="saved-remove" onClick={() => remove(p.postId)} className="press inline-flex min-h-tap items-center px-1 text-xs underline">
          {HEART_COPY.unsave}
        </button>
      </div>
    </li>
  )
  return (
    <>
      {current.length > 0 && <ul data-testid="saved-current" className="flex flex-col gap-3">{current.map(row)}</ul>}
      {past.length > 0 && (
        <section data-testid="saved-past" className="mt-6">
          <h2 className="text-micro font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">{HEART_COPY.savedPast}</h2>
          <ul className="mt-2 flex flex-col gap-3">{past.map(row)}</ul>
        </section>
      )}
    </>
  )
}
