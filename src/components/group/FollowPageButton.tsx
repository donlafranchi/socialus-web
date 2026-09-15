'use client'

// F067 — the follow control on a Page.
//
// Privacy decides the word (Don, 2026-09-15): a private Page is joined,
// anything else is followed. The same action serves both; only the label
// differs, because what the person is doing genuinely differs.
//
// Replaces FollowShopButton, which rendered "Follow {name}" and then said
// following was coming soon. It is not coming soon any more.

import { useState } from 'react'

interface Props {
  groupId: string
  isPrivate: boolean
  loggedIn: boolean
  following: boolean
  returnTo?: string
  onFollow: (input: { groupId: string }) => Promise<{ ok: true; relationship: 'member' | 'follower' }>
  onUnfollow: (input: { groupId: string }) => Promise<{ ok: true }>
}

export function FollowPageButton({
  groupId,
  isPrivate,
  loggedIn,
  following,
  returnTo,
  onFollow,
  onUnfollow,
}: Props) {
  const [isFollowing, setIsFollowing] = useState(following)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idle = isPrivate ? 'Join' : 'Follow'
  const done = isPrivate ? 'Joined' : 'Following'

  if (!loggedIn) {
    const href = `/auth/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ''}`
    return (
      <a href={href} data-testid="page-follow-signin" className="btn-primary">
        Sign in to {idle.toLowerCase()}
      </a>
    )
  }

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const next = !isFollowing
    try {
      if (next) await onFollow({ groupId })
      else await onUnfollow({ groupId })
      setIsFollowing(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Mind trying again?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid="page-follow"
        onClick={toggle}
        disabled={busy}
        className={
          isFollowing
            ? 'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-control-border)] bg-white px-5 text-sm font-medium text-[var(--color-charcoal-900)] disabled:opacity-50'
            : 'btn-primary disabled:opacity-50'
        }
      >
        {isFollowing ? done : idle}
      </button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-charcoal-900)]">
          {error}
        </p>
      )}
    </div>
  )
}
