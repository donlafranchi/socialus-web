'use client'

// #1171 (socialus-plan #269, Don 2026-11-02): "I kinda like both Heart and Save", "As separate things". Small, calm
// icons (Instagram's): ♡ is "I like this" and tells the poster who; the bookmark keeps a post on You, privately.
// Hidden signed out. Optimistic: the icon turns at once and goes back if the server says no.

import { useState } from 'react'
import { Bookmark, Heart } from 'lucide-react'
import { SignInPrompt } from '@/components/auth/SignInPrompt'
import { setHeartAction, setSaveAction } from '@/app/_actions/heart-save-actions'
import { flip, useMarks } from '@/lib/hearts/marks-store'
import { HEART_COPY } from '@/lib/copy'

const ICON_BUTTON =
  'press inline-flex size-tap shrink-0 items-center justify-center rounded-full text-[var(--color-fg)] hover:text-[var(--color-accent)] aria-pressed:text-[var(--color-accent)]'

function useToggle(kind: 'heartedPosts' | 'heartedPages' | 'savedPosts', id: string, send: (on: boolean) => ReturnType<typeof setSaveAction>) {
  const marks = useMarks()
  const [asking, setAsking] = useState(false)
  const on = marks[kind].has(id)
  const toggle = async () => {
    const undo = flip(kind, id, !on)
    const res = await send(!on).catch(() => ({ ok: false as const }))
    if (res.ok) return
    undo()
    if ('signedOut' in res && res.signedOut) setAsking(true)
  }
  return { visible: marks.signedIn === true, on, toggle, asking, stopAsking: () => setAsking(false) }
}

export function HeartButton({ target, returnTo }: { target: { postId: string } | { groupId: string }; returnTo?: string }) {
  const isPost = 'postId' in target
  const id = isPost ? target.postId : target.groupId
  const t = useToggle(isPost ? 'heartedPosts' : 'heartedPages', id, (on) => setHeartAction({ ...target, on }))
  if (!t.visible) return null
  return (
    <>
      <button
        type="button"
        data-testid="heart"
        aria-pressed={t.on}
        aria-label={isPost ? HEART_COPY.heartPost : HEART_COPY.heartPage}
        title={isPost ? HEART_COPY.heartPost : HEART_COPY.heartPage}
        {...(t.on ? {} : { 'data-shelf-save': '' })}
        onClick={t.toggle}
        className={ICON_BUTTON}
      >
        <Heart size={20} aria-hidden="true" fill={t.on ? 'currentColor' : 'none'} />
      </button>
      {t.asking && <SignInPrompt action="heart" currentPath={returnTo ?? currentPath()} onClose={t.stopAsking} />}
    </>
  )
}

export function SaveButton({ postId, returnTo }: { postId: string; returnTo?: string }) {
  const t = useToggle('savedPosts', postId, (on) => setSaveAction({ postId, on }))
  if (!t.visible) return null
  return (
    <>
      <button
        type="button"
        data-testid="save"
        aria-pressed={t.on}
        aria-label={HEART_COPY.savePost}
        title={t.on ? HEART_COPY.saved : HEART_COPY.savePost}
        {...(t.on ? {} : { 'data-shelf-save': '' })}
        onClick={t.toggle}
        className={ICON_BUTTON}
      >
        <Bookmark size={20} aria-hidden="true" fill={t.on ? 'currentColor' : 'none'} />
      </button>
      {t.asking && <SignInPrompt action="save" currentPath={returnTo ?? currentPath()} onClose={t.stopAsking} />}
    </>
  )
}

const currentPath = () => (typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search)
