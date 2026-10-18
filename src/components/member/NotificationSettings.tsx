'use client'

// #904 (Don, 2026-10-18, option A) — a member's notifications: each kind off until they turn it on, quiet hours,
// pause all. Turning a kind on asks the browser for permission and saves this browser's subscription first.

import { useEffect, useState, type ReactNode } from 'react'
import { NOTIFY_COPY as C } from '@/lib/notify/push/copy'
import type { Prefs } from '@/lib/notify/push/rules'
import { pushSupport, subscribeThisBrowser, type Support } from '@/lib/notify/push/browser'

type Save = (change: Partial<Prefs>) => Promise<{ ok: true; prefs: Prefs } | { ok: false }>
type Subscribe = (sub: { endpoint: string; p256dh: string; auth: string }) => Promise<{ ok: boolean }>

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`

export function NotificationSettings({ initial, save, subscribe }: { initial: Prefs; save: Save; subscribe: Subscribe }) {
  const [prefs, setPrefs] = useState(initial)
  const [support, setSupport] = useState<Support | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const s = pushSupport()
    setSupport(s)
    // A browser can rotate its subscription; with permission already given, re-saving it asks nothing.
    if (s === 'ready' && Notification.permission === 'granted' && (initial.followPosts || initial.weekend)) {
      void subscribeThisBrowser().then((sub) => (typeof sub === 'object' ? subscribe(sub) : null))
    }
  }, [initial, subscribe])

  const apply = async (change: Partial<Prefs>) => {
    if (busy) return
    setBusy(true)
    setStatus(null)
    try {
      const turningOn = change.followPosts === true || change.weekend === true
      if (turningOn) {
        const sub = await subscribeThisBrowser()
        if (sub === 'denied') {
          setSupport(pushSupport())
          return
        }
        if (sub === 'failed' || !(await subscribe(sub)).ok) {
          setStatus(C.failed)
          return
        }
      }
      const r = await save(change)
      if (!r.ok) return setStatus(C.failed)
      setPrefs(r.prefs)
      setStatus(C.saved)
    } catch {
      setStatus(C.failed)
    } finally {
      setBusy(false)
    }
  }

  const canTurnOn = support === 'ready'
  const notice =
    support === 'ios-install' ? C.iosInstall : support === 'ios-old' ? C.iosOld : support === 'blocked' ? C.blocked : support === 'unsupported' ? C.unsupported : C.allowAsk

  return (
    <div data-testid="notification-settings">
      <p
        className={`mb-4 text-body-sm ${canTurnOn ? 'text-[var(--color-fg-muted)]' : 'rounded-lg border border-[var(--color-border)] px-4 py-3 text-[var(--color-fg)]'}`}
        data-testid={`notify-support-${support ?? 'checking'}`}
      >
        {notice}
      </p>
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
        <Toggle
          id="notify-follow-posts"
          label={C.followPosts}
          hint={C.followPostsHint}
          on={prefs.followPosts}
          disabled={busy || (!prefs.followPosts && !canTurnOn)}
          onChange={(on) => apply({ followPosts: on })}
        />
        <Toggle
          id="notify-weekend"
          label={C.weekend}
          hint={C.weekendHint}
          on={prefs.weekend}
          disabled={busy || (!prefs.weekend && !canTurnOn)}
          onChange={(on) => apply({ weekend: on })}
        />
        <Item id="notify-quiet" label={C.quietHours} hint={C.quietHint}>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-body-sm">
            <HourSelect id="notify-quiet-start" label={C.quietFrom} value={prefs.quietStart} disabled={busy} onChange={(h) => apply({ quietStart: h })} />
            <HourSelect id="notify-quiet-end" label={C.quietTo} value={prefs.quietEnd} disabled={busy} onChange={(h) => apply({ quietEnd: h })} />
          </div>
        </Item>
        <Toggle id="notify-pause" label={C.pause} hint={C.pauseHint} on={prefs.paused} disabled={busy} onChange={(on) => apply({ paused: on })} />
      </ul>
      <p className="mt-3 min-h-6 text-body-sm text-[var(--color-fg-muted)]" role="status" data-testid="notify-status">
        {status}
      </p>
    </div>
  )
}

function Item({ id, label, hint, children, action }: { id: string; label: string; hint: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex min-h-tap items-start gap-3 px-4 py-3" data-testid={id}>
      <div className="min-w-0 flex-1">
        <span id={`${id}-label`} className="block text-body-sm font-medium text-[var(--color-fg)]">
          {label}
        </span>
        <span id={`${id}-hint`} className="mt-0.5 block text-caption text-[var(--color-fg-muted)]">
          {hint}
        </span>
        {children}
      </div>
      {action}
    </li>
  )
}

function Toggle({ id, label, hint, on, disabled, onChange }: { id: string; label: string; hint: string; on: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
  return (
    <Item
      id={id}
      label={label}
      hint={hint}
      action={
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          disabled={disabled}
          data-testid={`${id}-switch`}
          onClick={() => onChange(!on)}
          className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors before:absolute before:-inset-2.5 before:content-[''] disabled:opacity-50 ${
            on ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-control-border)]'
          }`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      }
    />
  )
}

function HourSelect({ id, label, value, disabled, onChange }: { id: string; label: string; value: number; disabled: boolean; onChange: (h: number) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-[var(--color-fg)]" htmlFor={id}>
      {label}
      <select
        id={id}
        data-testid={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-tap rounded-md border border-[var(--color-control-border)] bg-[var(--color-bg)] px-2 text-body-sm"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
    </label>
  )
}
