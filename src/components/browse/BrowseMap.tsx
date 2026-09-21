'use client'

// Browse's map. One pin per Page-and-place, which is new work rather than a
// port of the Item map: a Page appears at its own location and each of its
// posts at the post's own address, so one Page can produce several pins and
// several rows at one address must still produce one. The grouping itself is
// `@/lib/browse/pins`, where it is tested without a map.
//
// One accent pin, no per-kind colour ramp: PIN_COLORS is reserved for
// ownership tiers (CLAUDE.md § Design System), and the marker is a real DOM
// node in the document so the token resolves.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_DEFAULTS } from '@/lib/map-config'
import { groupPins, type BrowsePin } from '@/lib/browse/pins'
import type { BrowseResult } from '@/lib/feed/browse-feed'

const PIN_COLOR = 'var(--color-accent)'

export function BrowseMap({ results }: { results: readonly BrowseResult[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [selected, setSelected] = useState<BrowsePin | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_DEFAULTS.style,
      center: MAP_DEFAULTS.center,
      zoom: MAP_DEFAULTS.zoom,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const pins = groupPins(results)
    const bounds = new mapboxgl.LngLatBounds()

    for (const pin of pins) {
      const el = document.createElement('div')
      el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${PIN_COLOR};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:pointer`
      el.setAttribute('data-testid', 'map-pin')
      el.setAttribute('data-group-id', pin.groupId)
      el.setAttribute('data-result-count', String(pin.results.length))
      el.addEventListener('click', () => setSelected(pin))
      markersRef.current.push(
        new mapboxgl.Marker(el).setLngLat([pin.longitude, pin.latitude]).addTo(map),
      )
      bounds.extend([pin.longitude, pin.latitude])
    }

    if (pins.length > 0) map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 })
  }, [results])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" data-testid="browse-map" />
      {selected && (
        <div
          data-testid="browse-map-popup"
          className="absolute bottom-4 left-4 right-4 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg"
        >
          <p className="text-sm font-medium text-[var(--color-fg)]">{selected.name}</p>
          {/* What is here, not just that something is. Several rows at one
              address is the normal case now, not an edge. */}
          <ul className="mt-1 space-y-0.5">
            {selected.results.slice(0, 3).map((r) => (
              <li key={r.resultId} className="truncate text-xs text-[var(--color-fg-muted)]">
                {r.resultKind === 'post' ? (r.body ?? 'Posted') : (r.description ?? r.name)}
              </li>
            ))}
          </ul>
          {selected.results.length > 3 && (
            <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
              {selected.results.length - 3} more here
            </p>
          )}
          <div className="mt-2 flex items-center gap-3">
            {selected.href && (
              <Link
                href={selected.href}
                className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--color-charcoal-900)] underline"
              >
                Open Page
              </Link>
            )}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="ml-auto inline-flex min-h-11 items-center text-sm text-[var(--color-fg-muted)]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
