'use client'

// #348 — confirm an address on a map. The pin stays fixed at the centre and
// the owner moves the map under it to the exact spot: Airbnb's host-location
// pattern, which avoids fiddly pin-dragging on a phone.

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPin } from 'lucide-react'
import { MAP_DEFAULTS } from '@/lib/map-config'

export function PinAdjustMap({
  center,
  onChange,
}: {
  center: [number, number]
  onChange: (coords: [number, number]) => void
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const el = useRef<HTMLDivElement>(null)
  const report = useRef(onChange)
  // Where the map opens. The centres it reports flow back in as `center`;
  // following them would rebuild the map on every pan. A new address remounts.
  const start = useRef(center)
  useEffect(() => {
    report.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!token || !el.current) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({ container: el.current, style: MAP_DEFAULTS.style, center: start.current, zoom: 16 })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }))
    map.on('moveend', () => {
      const c = map.getCenter()
      report.current([Number(c.lng.toFixed(6)), Number(c.lat.toFixed(6))])
    })
    return () => map.remove()
  }, [token])

  if (!token) {
    return (
      <p data-testid="pin-adjust" className="text-caption text-[var(--color-fg-muted)]">
        The map isn&rsquo;t available here, so the pin goes on the address as found.
      </p>
    )
  }
  return (
    <div data-testid="pin-adjust" className="flex flex-col gap-1">
      <div className="relative h-56 overflow-hidden rounded-md border border-[var(--color-border)]">
        <div ref={el} className="absolute inset-0" />
        <MapPin
          data-testid="pin-adjust-pin"
          aria-hidden="true"
          size={32}
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-[var(--color-pin)]"
          fill="currentColor"
          stroke="var(--color-pin-edge)"
        />
      </div>
      <p className="text-caption text-[var(--color-fg-muted)]">Move the map so the pin sits on your door.</p>
    </div>
  )
}
