'use client'

// #962 — every Page the member follows: photo, name, town, the next dated post, Remind me every time (#945) and
// Unfollow with Undo. Quiet text links only (Don, 2026-10-18: no chips or pills).

import { useState } from 'react'
import Link from 'next/link'
import type { FollowedPage } from '@/lib/follows/followed-pages'
import { RemindEveryTimeButton } from '@/components/reminders/RemindMe'
import { announcementAnchor } from '@/components/group/announcement-anchor'
import { formatCardWhen } from '@/lib/metro/metro-time'

export interface FollowedPagesActions {
  unfollow: (input: { groupId: string }) => Promise<unknown>
  follow: (input: { groupId: string }) => Promise<unknown>
  everyForPage: (groupId: string) => Promise<{ ok: true; added: number } | { ok: false }>
}

const LINK = 'press inline-flex min-h-tap items-center text-body-sm font-medium text-[var(--color-accent)]'

function Row({ page, actions }: { page: FollowedPage; actions: FollowedPagesActions }) {
  const [followed, setFollowed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const toggle = async () => {
    const next = !followed
    setBusy(true)
    setFailed(false)
    setFollowed(next)
    try {
      await (next ? actions.follow : actions.unfollow)({ groupId: page.groupId })
    } catch {
      setFollowed(!next)
      setFailed(true)
    }
    setBusy(false)
  }

  return (
    <li data-testid="followed-page" className="flex gap-3 py-3">
      <Link href={page.href} tabIndex={-1} aria-hidden="true" className="press shrink-0">
        {page.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.photoUrl} alt="" loading="lazy" className="h-14 w-14 rounded-md object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-md bg-[var(--color-surface)] text-title-3 text-[var(--color-fg-muted)]">
            {page.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </Link>
      <div className={`min-w-0 flex-1 ${followed ? '' : 'opacity-60'}`}>
        <Link href={page.href} className="press block truncate text-body font-semibold text-[var(--color-fg)]">
          {page.name}
        </Link>
        {page.town && <p className="truncate text-body-sm text-[var(--color-fg-muted)]">{page.town}</p>}
        {page.nextPost && (
          <Link
            href={`${page.href}#${announcementAnchor(page.nextPost.id)}`}
            data-testid="followed-next"
            className="press mt-0.5 block truncate text-body-sm text-[var(--color-fg)]"
          >
            <span className="font-semibold">{formatCardWhen(page.nextPost.startsAt)}</span>
            {page.nextPost.title && <span> · {page.nextPost.title}</span>}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-4">
          {followed && page.repeatingSeries.length > 0 && (
            <RemindEveryTimeButton groupId={page.groupId} on={page.everyTimeOn} everyForPage={actions.everyForPage} />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={toggle}
            aria-label={followed ? `Unfollow ${page.name}` : `Undo, keep following ${page.name}`}
            className="press inline-flex min-h-tap items-center text-xs font-medium text-[var(--color-fg-muted)] underline disabled:opacity-50"
          >
            {followed ? 'Unfollow' : 'Unfollowed · Undo'}
          </button>
          {failed && (
            <span role="alert" className="text-xs text-[var(--color-danger,#b91c1c)]">
              That didn’t save. Mind trying again?
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

export function FollowedPagesList({ pages, actions }: { pages: FollowedPage[]; actions: FollowedPagesActions }) {
  if (pages.length === 0) {
    return (
      <div data-testid="followed-pages-empty" className="py-6">
        <p className="text-body-sm text-[var(--color-fg-muted)]">You’re not following any Pages yet. Follow one you like and it shows up here.</p>
        <Link href="/explore" className={`${LINK} underline`}>
          Find Pages in Explore
        </Link>
      </div>
    )
  }
  return (
    <ul className="divide-y divide-[var(--color-border)]" data-testid="followed-pages">
      {pages.map((p) => (
        <Row key={p.groupId} page={p} actions={actions} />
      ))}
    </ul>
  )
}
