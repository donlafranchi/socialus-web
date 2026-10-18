'use client'

// #904 — on the screen a notification opened (?via=push-<kind>): count the open once, and offer one tap to turn
// that kind off. #945 — a reminder (?via=reminder&r=<id>, by push or email) offers one tap to stop that reminder.
// The markers leave the address so a reload or a shared link carries nothing.

import { useEffect, useState } from 'react'
import { NOTIFY_COPY as C } from '@/lib/notify/push/copy'
import type { CountKind, NotifyKind } from '@/lib/notify/push/rules'
import { countNotificationOpenAction, turnOffNotificationKindAction } from '@/app/_actions/notification-actions'
import { removeReminderAction } from '@/app/_actions/reminder-actions'

type Actions = {
  countOpen: (k: CountKind) => Promise<unknown>
  turnOff: (k: NotifyKind) => Promise<{ ok: boolean }>
  stopReminder: (reminderId: string) => Promise<{ ok: boolean }>
}

export function kindFromVia(search: string): CountKind | null {
  const via = new URLSearchParams(search).get('via')
  return via === 'push-follow_posts' ? 'follow_posts' : via === 'push-weekend' ? 'weekend' : via === 'reminder' ? 'reminder' : null
}

const SERVER: Actions = { countOpen: countNotificationOpenAction, turnOff: turnOffNotificationKindAction, stopReminder: removeReminderAction }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function PushLandingBar({ actions = SERVER }: { actions?: Actions }) {
  const [landing, setLanding] = useState<{ kind: CountKind; reminderId: string | null } | null>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')

  useEffect(() => {
    const kind = kindFromVia(window.location.search)
    if (!kind) return
    const url = new URL(window.location.href)
    const r = url.searchParams.get('r')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is read once, after hydration, then cleaned
    setLanding({ kind, reminderId: r && UUID.test(r) ? r : null })
    void actions.countOpen(kind)
    url.searchParams.delete('via')
    url.searchParams.delete('r')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [actions])

  if (!landing || (landing.kind === 'reminder' && !landing.reminderId)) return null
  const { kind, reminderId } = landing
  const off = async () => {
    setState('busy')
    const r = await (kind === 'reminder' ? actions.stopReminder(reminderId!) : actions.turnOff(kind)).catch(() => ({ ok: false }))
    setState(r.ok ? 'done' : 'failed')
  }
  const said = kind === 'reminder' ? C.landingReminder : kind === 'weekend' ? C.landingWeekend : C.landingFollow
  const done = kind === 'reminder' ? C.landingReminderDone : C.landingDone

  return (
    <div className="mx-auto w-full max-w-read gutter pt-3" data-testid="push-landing-bar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-body-sm" role="status">
        <span className="min-w-0 flex-1 text-[var(--color-fg-muted)]">{state === 'done' ? done : state === 'failed' ? C.failed : said}</span>
        {state !== 'done' && (
          <button
            type="button"
            onClick={off}
            disabled={state === 'busy'}
            data-testid="push-landing-off"
            className="press inline-flex min-h-tap items-center font-medium text-[var(--color-accent)] disabled:opacity-50"
          >
            {kind === 'reminder' ? C.landingReminderOff : C.landingOff}
          </button>
        )}
      </div>
    </div>
  )
}
