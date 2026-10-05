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
import { Check } from 'lucide-react'
import { SignInPrompt } from '@/components/auth/SignInPrompt'
import { buttonClass } from '@/components/ui/Button'

interface Props {
  groupId: string
  isPrivate: boolean
  /** Page kinds (dispatch, 2026-10-05): a group is joined, like a private Page. */
  join?: boolean
  loggedIn: boolean
  following: boolean
  returnTo?: string
  onFollow: (input: { groupId: string }) => Promise<{ ok: true; relationship: 'member' | 'follower' }>
  onUnfollow: (input: { groupId: string }) => Promise<{ ok: true }>
}

export function FollowPageButton({
  groupId,
  isPrivate,
  join = false,
  loggedIn,
  following,
  returnTo,
  onFollow,
  onUnfollow,
}: Props) {
  const [isFollowing, setIsFollowing] = useState(following)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const idle = isPrivate || join ? 'Join' : 'Follow'
  const done = isPrivate || join ? 'Joined' : 'Following'

  // #297 — signed out, nobody can follow (Don, 2026-10-04): the button says
  // so and opens the sign-up sheet. The tap is kept: sign-up comes back here.
  if (!loggedIn) {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          data-testid="page-follow-signin"
          onClick={() => setAsking(true)}
          className={buttonClass('secondary')}
        >
          Sign up to {idle.toLowerCase()}
        </button>
        {asking && <SignInPrompt action="follow" currentPath={returnTo ?? '/'} onClose={() => setAsking(false)} />}
      </div>
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
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        data-testid="page-follow"
        onClick={toggle}
        disabled={busy}
        className={isFollowing ? buttonClass('secondary') : buttonClass('primary')}
      >
        {isFollowing && <Check size={16} aria-hidden="true" />}
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
