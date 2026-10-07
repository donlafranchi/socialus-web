'use client'

// Browse's map. One pin per Page-and-place, which is new work rather than a
// port of the Item map: a Page appears at its own location and each of its
// posts at the post's own address, so one Page can produce several pins and
// several rows at one address must still produce one. The grouping itself is
// `@/lib/browse/pins`, where it is tested without a map.
//
// Navy pins, the selected one gold (Don, 2026-10-05), drawn by the one
// marker helper so the tokens decide the colour.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_DEFAULTS, METRO_VIEW, CLUSTER_CONFIG } from '@/lib/map-config'
import { groupPins, type BrowsePin } from '@/lib/browse/pins'
import { stylePin, styleCluster } from '@/lib/map-pins'
import { gridCluster } from '@/lib/browse/cluster'
import type { BrowseResult } from '@/lib/feed/browse-feed'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export function BrowseMap({ results, center }: { results: readonly BrowseResult[]; center?: [number, number] }) {
  const metroCenter = center ?? METRO_VIEW.fallbackCenter
  const metroCenterRef = useRef(metroCenter)
  useEffect(() => {
    metroCenterRef.current = metroCenter
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [selected, setSelected] = useState<BrowsePin | null>(null)

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return
    mapboxgl.accessToken = TOKEN
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_DEFAULTS.style,
      center: metroCenterRef.current,
      zoom: METRO_VIEW.zoom,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  const pinsRef = useRef<BrowsePin[]>([])
  const selectedRef = useRef<string | null>(null)

  // #331 — draw pins, clustering ones that sit close together on screen until
  // CLUSTER_CONFIG.clusterMaxZoom. Redrawn on every move, from the same pins.
  const draw = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    const pins = pinsRef.current
    const byKey = new Map(pins.map((p) => [p.key, p]))
    const groups =
      map.getZoom() >= CLUSTER_CONFIG.clusterMaxZoom
        ? pins.map((p) => ({ keys: [p.key] }))
        : gridCluster(pins.map((p) => ({ key: p.key, ...map.project([p.longitude, p.latitude]) })))
    for (const g of groups) {
      const members = g.keys.map((k) => byKey.get(k)!)
      const el = document.createElement('div')
      if (members.length > 1) {
        styleCluster(el, members.length)
        el.setAttribute('data-testid', 'map-cluster')
        const bounds = new mapboxgl.LngLatBounds()
        for (const m of members) bounds.extend([m.longitude, m.latitude])
        el.addEventListener('click', () => map.fitBounds(bounds, { padding: 80, maxZoom: CLUSTER_CONFIG.clusterMaxZoom }))
        const c = bounds.getCenter()
        markersRef.current.push(new mapboxgl.Marker(el).setLngLat(c).addTo(map))
        continue
      }
      const pin = members[0]!
      stylePin(el, { small: true, selected: pin.groupId === selectedRef.current })
      el.setAttribute('data-testid', 'map-pin')
      el.setAttribute('data-group-id', pin.groupId)
      el.setAttribute('data-result-count', String(pin.results.length))
      const bucket = (pin.results[0] as { bucket?: string } | undefined)?.bucket
      if (bucket) el.setAttribute('data-bucket', bucket)
      el.addEventListener('click', () => setSelected(pin))
      markersRef.current.push(new mapboxgl.Marker(el).setLngLat([pin.longitude, pin.latitude]).addTo(map))
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.on('moveend', draw)
    return () => {
      map.off('moveend', draw)
    }
  }, [draw])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const pins = groupPins(results)
    pinsRef.current = pins
    if (pins.length > 0) {
      const bounds = new mapboxgl.LngLatBounds()
      for (const p of pins) bounds.extend([p.longitude, p.latitude])
      map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 })
    }
    draw()
  }, [results, draw])

  // Nothing pinned: the view follows the metro, so a metro change moves the map.
  const [lng, lat] = metroCenter
  useEffect(() => {
    const map = mapRef.current
    if (!map || pinsRef.current.length > 0) return
    map.jumpTo({ center: [lng, lat], zoom: METRO_VIEW.zoom })
  }, [lng, lat])

  useEffect(() => {
    selectedRef.current = selected?.groupId ?? null
    draw()
  }, [selected, draw])

  // T187 — without a token Mapbox throws, and the map now mounts on every
  // desktop load; a missing token must cost the map, not the page.
  if (!TOKEN) {
    return (
      <div
        data-testid="browse-map"
        data-unavailable=""
        className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-[var(--color-fg-muted)]"
      >
        The map isn&rsquo;t available right now.
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" data-testid="browse-map" />
      {selected && (
        <div
          data-testid="browse-map-popup"
          className="absolute bottom-4 left-4 right-4 rounded-md border border-neutral-200 bg-white p-3 shadow-overlay"
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
