'use client'

// #896 — a Page's locations, or where and when it moves: one row each, each
// with Directions in the phone's maps app (Apple Maps on iPhone, Google
// elsewhere) — the one thing that leaves the app (Don, 2026-10-18).

import { useSyncExternalStore } from 'react'
import { isAppleMobile, mapsLinks } from '@/lib/maps/links'
import type { PageStop } from '@/lib/groups/page-where'

const LINK = 'press inline-flex min-h-tap items-center text-body-sm font-medium text-[var(--color-accent)] underline'
const noSubscribe = () => () => {}

export function PageStops({ stops, schedule, name }: { stops: PageStop[]; schedule: boolean; name?: string }) {
  const apple = useSyncExternalStore(noSubscribe, () => isAppleMobile(), () => false)
  const out = { target: '_blank', rel: 'noopener noreferrer' } as const
  return (
    <ul data-testid="page-stops" className="flex flex-col divide-y divide-[var(--color-border)]">
      {stops.map((s) => {
        // A location is the business at that address; a market stop is the market itself.
        const links = mapsLinks({ label: s.label, ...(schedule ? {} : { name }) }, apple)
        return (
          <li key={`${s.label}-${s.whenText}`} className="flex flex-col py-2 first:pt-0 last:pb-0">
            {schedule && s.whenText && <span className="text-body-sm font-medium text-[var(--color-fg)]">{s.whenText}</span>}
            <span className={schedule && s.whenText ? 'text-body-sm text-[var(--color-fg-muted)]' : 'text-body-sm text-[var(--color-fg)]'}>{s.label}</span>
            {links.directions && (
              <a href={links.directions} {...out} aria-label={`Directions to ${s.label}`} className={`${LINK} self-start`}>
                Directions
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
