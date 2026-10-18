'use client'

// #945 — Remind me on a dated post: one tap; for a post that repeats, "Just this one" or "Every time". On a Page that
// repeats, once followed, "Remind me every time" in one tap. Private: only the member sees their reminders.

import { useState } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { NOTIFY_COPY as C } from '@/lib/notify/push/copy'

type SetResult = { ok: true; reminderId: string } | { ok: false }
export interface RemindActions {
  set: (input: { postId: string; every: boolean }) => Promise<SetResult>
  remove: (reminderId: string) => Promise<{ ok: boolean }>
}

const CONTROL = 'press inline-flex min-h-tap items-center gap-1.5 px-1 text-xs font-medium text-[var(--color-accent)] disabled:opacity-50'

export function RemindMeButton({
  postId,
  repeats,
  reminderId: initial,
  loggedIn,
  returnTo,
  actions,
}: {
  postId: string
  repeats: boolean
  reminderId: string | null
  loggedIn: boolean
  returnTo: string
  actions: RemindActions
}) {
  const [reminderId, setReminderId] = useState(initial)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  if (!loggedIn) {
    return (
      <a href={`/auth/login?next=${encodeURIComponent(returnTo)}`} className={CONTROL} data-testid="remind-me-signin">
        <Bell size={14} aria-hidden="true" />
        {C.remindMe}
      </a>
    )
  }

  const set = async (every: boolean) => {
    setChoosing(false)
    setBusy(true)
    const r = await actions.set({ postId, every }).catch(() => ({ ok: false }) as const)
    setBusy(false)
    if (r.ok) setReminderId(r.reminderId)
    setStatus(r.ok ? C.remindSaved : C.failed)
  }
  const remove = async () => {
    if (!reminderId) return
    setBusy(true)
    const r = await actions.remove(reminderId).catch(() => ({ ok: false }))
    setBusy(false)
    if (r.ok) setReminderId(null)
    setStatus(r.ok ? C.remindRemoved : C.failed)
  }

  return (
    <span className="inline-flex items-center gap-2" data-testid="remind-me">
      <button
        type="button"
        disabled={busy}
        aria-pressed={!!reminderId}
        onClick={() => (reminderId ? remove() : repeats ? setChoosing(true) : set(false))}
        className={CONTROL}
      >
        {reminderId ? <BellRing size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
        {reminderId ? C.reminderOn : C.remindMe}
      </button>
      <span role="status" className="text-xs text-[var(--color-fg-muted)]">
        {status}
      </span>
      <Sheet open={choosing} title={C.remindChoiceTitle} onClose={() => setChoosing(false)} testId="remind-me-choice">
        <div className="flex flex-col gap-2 pb-2">
          <button type="button" onClick={() => set(true)} className="press min-h-tap rounded-lg border border-[var(--color-border)] px-4 text-left text-body-sm font-medium">
            {C.remindEvery}
          </button>
          <button type="button" onClick={() => set(false)} className="press min-h-tap rounded-lg border border-[var(--color-border)] px-4 text-left text-body-sm">
            {C.remindOne}
          </button>
        </div>
      </Sheet>
    </span>
  )
}

export function RemindEveryTimeButton({
  groupId,
  on: initial,
  everyForPage,
}: {
  groupId: string
  on: boolean
  everyForPage: (groupId: string) => Promise<{ ok: true; added: number } | { ok: false }>
}) {
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  if (on && !status) return null
  const go = async () => {
    setBusy(true)
    const r = await everyForPage(groupId).catch(() => ({ ok: false }) as const)
    setBusy(false)
    if (r.ok) setOn(true)
    setStatus(r.ok ? C.remindSaved : C.failed)
  }
  return (
    <span className="inline-flex items-center gap-2" data-testid="remind-every-time">
      {!on && (
        <button type="button" onClick={go} disabled={busy} className={CONTROL}>
          <Bell size={14} aria-hidden="true" />
          {C.remindEveryTime}
        </button>
      )}
      <span role="status" className="text-xs text-[var(--color-fg-muted)]">
        {status}
      </span>
    </span>
  )
}
