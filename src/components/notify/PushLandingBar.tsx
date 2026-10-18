'use client'

// #904 — on the screen a notification opened (?via=push-<kind>): count the open once, and offer one tap to turn
// that kind off. The marker leaves the address so a reload or a shared link carries nothing.

import { useEffect, useState } from 'react'
import { NOTIFY_COPY as C } from '@/lib/notify/push/copy'
import type { NotifyKind } from '@/lib/notify/push/rules'
import { countNotificationOpenAction, turnOffNotificationKindAction } from '@/app/_actions/notification-actions'

type Actions = { countOpen: (k: NotifyKind) => Promise<unknown>; turnOff: (k: NotifyKind) => Promise<{ ok: boolean }> }

export function kindFromVia(search: string): NotifyKind | null {
  const via = new URLSearchParams(search).get('via')
  return via === 'push-follow_posts' ? 'follow_posts' : via === 'push-weekend' ? 'weekend' : null
}

const SERVER: Actions = { countOpen: countNotificationOpenAction, turnOff: turnOffNotificationKindAction }

export function PushLandingBar({ actions = SERVER }: { actions?: Actions }) {
  const [kind, setKind] = useState<NotifyKind | null>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')

  useEffect(() => {
    const k = kindFromVia(window.location.search)
    if (!k) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is read once, after hydration, then cleaned
    setKind(k)
    void actions.countOpen(k)
    const url = new URL(window.location.href)
    url.searchParams.delete('via')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [actions])

  if (!kind) return null
  const off = async () => {
    setState('busy')
    const r = await actions.turnOff(kind).catch(() => ({ ok: false }))
    setState(r.ok ? 'done' : 'failed')
  }

  return (
    <div className="mx-auto w-full max-w-read gutter pt-3" data-testid="push-landing-bar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-body-sm" role="status">
        <span className="min-w-0 flex-1 text-[var(--color-fg-muted)]">
          {state === 'done' ? C.landingDone : state === 'failed' ? C.failed : kind === 'weekend' ? C.landingWeekend : C.landingFollow}
        </span>
        {state !== 'done' && (
          <button
            type="button"
            onClick={off}
            disabled={state === 'busy'}
            data-testid="push-landing-off"
            className="press inline-flex min-h-tap items-center font-medium text-[var(--color-accent)] disabled:opacity-50"
          >
            {C.landingOff}
          </button>
        )}
      </div>
    </div>
  )
}
