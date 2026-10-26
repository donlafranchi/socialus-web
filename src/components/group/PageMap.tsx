'use client'

// #896 — the Location map: a static street map (no map library on the Page).
// Tapping it opens our own map, on this Page (Don, 2026-10-18: "shouldn't the
// map open our own map? Do we want people leaving the app."). Only Directions
// leaves: Apple Maps on iPhone and iPad, Google Maps everywhere else.

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Navigation } from 'lucide-react'
import { mapsTargetOf, staticMapUrl, type PageMapView } from '@/lib/groups/page-map'
import { isAppleMobile, mapsLinks } from '@/lib/maps/links'
import { mapFocusHref } from '@/lib/browse/map-focus'

// #896 — quiet text links (Don, 2026-10-18: no chips or pills); 44px tall to tap.
const LINK = 'press inline-flex min-h-tap items-center gap-2 text-body-sm font-medium text-[var(--color-accent)] underline'
const noSubscribe = () => () => {}

export function PageMap({ view, caption, publicId }: { view: PageMapView; caption: string | null; publicId: string }) {
  // false on the server and first paint (Google), then the device's own.
  const apple = useSyncExternalStore(noSubscribe, () => isAppleMobile(), () => false)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const directions = mapsLinks(mapsTargetOf(view), apple).directions

  return (
    <div data-testid="page-map" className="flex flex-col gap-3">
      {token && (
        <Link href={mapFocusHref(publicId, view.centre)} aria-label={`Show ${view.text} on the map`} data-testid="page-map-ours" className="press block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={staticMapUrl(view, token)}
            alt={`Map of ${view.text}`}
            loading="lazy"
            width={400}
            height={200}
            className="aspect-[2/1] w-full rounded-md border border-[var(--color-border)] object-cover"
          />
        </Link>
      )}
      {caption && (
        <p data-testid="shop-placement" className="text-body-sm text-[var(--color-fg)]">
          {caption}
        </p>
      )}
      {directions && (
        <a href={directions} target="_blank" rel="noopener noreferrer" data-testid="page-map-directions" className={`${LINK} self-start`}>
          <Navigation size={16} aria-hidden="true" />
          Directions
        </a>
      )}
    </div>
  )
}
