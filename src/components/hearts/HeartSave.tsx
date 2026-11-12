'use client'

// #1171 (socialus-plan #269, Don 2026-11-02): "I kinda like both Heart and Save", "As separate things". Small, calm
// icons (Instagram's): ♡ is "I like this" and tells the poster who; the bookmark keeps a post on You, privately.
// F134.4 — shown signed out too: a tap asks for sign-in first and saves nothing, and the heart is there once they
// are back. Optimistic: the icon turns at once and goes back if the server says no.

import { Bookmark, Heart } from 'lucide-react'
import { useSignInFirst } from '@/hooks/useSignInFirst'
import { setHeartAction, setSaveAction } from '@/app/_actions/heart-save-actions'
import { flip, useMarks } from '@/lib/hearts/marks-store'
import { HEART_COPY } from '@/lib/copy'

const ICON_BUTTON =
  'press inline-flex size-tap shrink-0 items-center justify-center rounded-full text-[var(--color-fg)] hover:text-[var(--color-accent)] aria-pressed:text-[var(--color-accent)]'

function useToggle(
  kind: 'heartedPosts' | 'heartedPages' | 'savedPosts',
  id: string,
  action: 'heart' | 'save',
  returnTo: string | undefined,
  send: (on: boolean) => ReturnType<typeof setSaveAction>,
) {
  const marks = useMarks()
  const on = marks[kind].has(id)
  const set = async (next: boolean) => {
    const undo = flip(kind, id, next)
    const res = await send(next).catch(() => ({ ok: false as const }))
    if (res.ok) return
    undo()
    // A session that ended mid-visit: ask now, nothing was kept.
    if ('signedOut' in res && res.signedOut) gate.prompt()
  }
  // Back from sign-in: on, whatever it was before, so a second tap never undoes the first.
  const gate = useSignInFirst({ action, target: id, signedIn: marks.signedIn ?? undefined, returnTo, onReturn: () => void set(true) })
  return { visible: marks.signedIn !== null, on, toggle: () => gate.ask(() => void set(!on)), sheet: gate.sheet }
}

export function HeartButton({ target, returnTo }: { target: { postId: string } | { groupId: string }; returnTo?: string }) {
  const isPost = 'postId' in target
  const id = isPost ? target.postId : target.groupId
  const t = useToggle(isPost ? 'heartedPosts' : 'heartedPages', id, 'heart', returnTo, (on) => setHeartAction({ ...target, on }))
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
      {t.sheet}
    </>
  )
}

export function SaveButton({ postId, returnTo }: { postId: string; returnTo?: string }) {
  const t = useToggle('savedPosts', postId, 'save', returnTo, (on) => setSaveAction({ postId, on }))
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
      {t.sheet}
    </>
  )
}
