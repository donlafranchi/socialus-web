'use client'

// #945 — on You → Alerts: when reminders come, and the member's own reminders, each one removable.

import { useState } from 'react'
import Link from 'next/link'
import { NOTIFY_COPY as C } from '@/lib/notify/push/copy'
import { Item, Toggle } from '@/components/member/NotificationSettings'

type Timings = { remindEvening: boolean; remindHour: boolean }
type Save = (change: Partial<Timings>) => Promise<{ ok: true; prefs: Timings } | { ok: false }>

export function ReminderSettings({
  initial,
  save,
  list: initialList,
  remove,
}: {
  initial: Timings
  save: Save
  list: { id: string; label: string; href: string }[]
  remove: (reminderId: string) => Promise<{ ok: boolean }>
}) {
  const [timings, setTimings] = useState(initial)
  const [list, setList] = useState(initialList)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const apply = async (change: Partial<Timings>) => {
    setBusy(true)
    const r = await save(change).catch(() => ({ ok: false }) as const)
    setBusy(false)
    if (r.ok) setTimings({ remindEvening: r.prefs.remindEvening, remindHour: r.prefs.remindHour })
    setStatus(r.ok ? C.saved : C.failed)
  }
  const drop = async (id: string) => {
    setBusy(true)
    const r = await remove(id).catch(() => ({ ok: false }))
    setBusy(false)
    if (r.ok) setList((l) => l.filter((x) => x.id !== id))
    setStatus(r.ok ? C.remindRemoved : C.failed)
  }

  return (
    <section className="mt-8" data-testid="reminder-settings">
      <h2 className="text-title-3 text-[var(--color-fg)]">{C.remindersTitle}</h2>
      <p className="mt-1 mb-3 text-body-sm text-[var(--color-fg-muted)]">{C.remindersHint}</p>
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
        <Toggle id="remind-evening" label={C.remindEvening} hint={C.remindEveningHint} on={timings.remindEvening} disabled={busy} onChange={(on) => apply({ remindEvening: on })} />
        <Toggle id="remind-hour" label={C.remindHour} hint={C.remindHourHint} on={timings.remindHour} disabled={busy} onChange={(on) => apply({ remindHour: on })} />
      </ul>
      {list.length === 0 ? (
        <p className="mt-3 text-body-sm text-[var(--color-fg-muted)]" data-testid="reminders-none">
          {C.remindersNone}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]" data-testid="reminders-list">
          {list.map((r) => (
            <Item
              key={r.id}
              id={`reminder-${r.id}`}
              action={
                <button type="button" onClick={() => drop(r.id)} disabled={busy} className="press inline-flex min-h-tap items-center text-body-sm font-medium text-[var(--color-accent)]">
                  {C.remindRemove}
                </button>
              }
            >
              <Link href={r.href} className="inline-flex min-h-tap items-center text-body-sm text-[var(--color-fg)] underline-offset-2 hover:underline">
                {r.label}
              </Link>
            </Item>
          ))}
        </ul>
      )}
      <p className="mt-2 min-h-6 text-body-sm text-[var(--color-fg-muted)]" role="status">
        {status}
      </p>
    </section>
  )
}
