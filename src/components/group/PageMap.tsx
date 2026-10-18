'use client'

// #896 — the Location map: a static street map (no map library on the Page),
// and tapping it or Open in Maps opens the phone's maps app. Apple Maps on
// iPhone and iPad, Google Maps everywhere else. Signed-in visitors only.

import { useSyncExternalStore } from 'react'
import { MapPin, Navigation } from 'lucide-react'
import { mapsTargetOf, staticMapUrl, type PageMapView } from '@/lib/groups/page-map'
import { isAppleMobile, mapsLinks } from '@/lib/maps/links'

// #896 — quiet text links (Don, 2026-10-18: no chips or pills); 44px tall to tap.
const LINK = 'press inline-flex min-h-tap items-center gap-2 text-body-sm font-medium text-[var(--color-accent)] underline'
const noSubscribe = () => () => {}

export function PageMap({ view, caption }: { view: PageMapView; caption: string | null }) {
  // false on the server and first paint (Google), then the device's own.
  const apple = useSyncExternalStore(noSubscribe, () => isAppleMobile(), () => false)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const links = mapsLinks(mapsTargetOf(view), apple)
  const out = { target: '_blank', rel: 'noopener noreferrer' } as const

  return (
    <div data-testid="page-map" className="flex flex-col gap-3">
      {token && (
        <a href={links.open} {...out} aria-label={`Open ${view.text} in Maps`} className="press block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={staticMapUrl(view, token)}
            alt={`Map of ${view.text}`}
            loading="lazy"
            width={400}
            height={200}
            className="aspect-[2/1] w-full rounded-md border border-[var(--color-border)] object-cover"
          />
        </a>
      )}
      {caption && (
        <p data-testid="shop-placement" className="text-body-sm text-[var(--color-fg)]">
          {caption}
        </p>
      )}
      <div className="flex flex-wrap gap-x-6">
        <a href={links.open} {...out} data-testid="page-map-open" className={LINK}>
          <MapPin size={16} aria-hidden="true" />
          Open in Maps
        </a>
        {links.directions && (
          <a href={links.directions} {...out} data-testid="page-map-directions" className={LINK}>
            <Navigation size={16} aria-hidden="true" />
            Directions
          </a>
        )}
      </div>
    </div>
  )
}
