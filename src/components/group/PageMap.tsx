'use client'

// #896 — the Location map: a static street map (no map library on the Page),
// and tapping it or Open in Maps opens the phone's maps app. Apple Maps on
// iPhone and iPad, Google Maps everywhere else. Signed-in visitors only.

import { useSyncExternalStore } from 'react'
import { MapPin, Navigation } from 'lucide-react'
import { mapsLinks, staticMapUrl, type PageMapView } from '@/lib/groups/page-map'

const isAppleMobile = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const noSubscribe = () => () => {}

export function PageMap({ view, caption }: { view: PageMapView; caption: string | null }) {
  // false on the server and first paint (Google), then the device's own.
  const apple = useSyncExternalStore(noSubscribe, isAppleMobile, () => false)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const links = mapsLinks(view, apple)
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
      <div className="flex flex-wrap gap-2">
        <a href={links.open} {...out} data-testid="page-map-open" className="btn-secondary gap-2">
          <MapPin size={16} aria-hidden="true" />
          Open in Maps
        </a>
        {links.directions && (
          <a href={links.directions} {...out} data-testid="page-map-directions" className="btn-secondary gap-2">
            <Navigation size={16} aria-hidden="true" />
            Directions
          </a>
        )}
      </div>
    </div>
  )
}
