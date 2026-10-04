'use client'

// #348 — tap a neighbourhood or town on the map to pick it (Zillow's boundary
// search, Nextdoor's fixed neighbourhoods). Neighbourhoods sit above towns,
// so a tap inside Sacramento picks the neighbourhood, not the whole city.

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_DEFAULTS, AREA_OUTLINE } from '@/lib/map-config'

export interface AreaPick {
  placeId: string
  name: string
}

const SACRAMENTO: [number, number] = [-121.35, 38.62]

export function AreaPickMap({ onPick, selectedPlaceId }: { onPick: (p: AreaPick) => void; selectedPlaceId?: string | null }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const pick = useRef(onPick)
  useEffect(() => {
    pick.current = onPick
  }, [onPick])

  useEffect(() => {
    if (!token || !el.current) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({ container: el.current, style: MAP_DEFAULTS.style, center: SACRAMENTO, zoom: 9 })
    mapRef.current = map
    map.on('load', () => {
      map.addSource('areas', { type: 'geojson', data: '/api/boundaries?msa=40900' })
      for (const kind of ['city', 'neighborhood'] as const) {
        map.addLayer({ id: `${kind}-fill`, type: 'fill', source: 'areas', filter: ['==', ['get', 'kind'], kind], paint: { 'fill-color': AREA_OUTLINE, 'fill-opacity': ['case', ['==', ['get', 'placeId'], selectedPlaceId ?? ''], 0.25, 0.04] } })
        map.addLayer({ id: `${kind}-line`, type: 'line', source: 'areas', filter: ['==', ['get', 'kind'], kind], paint: { 'line-color': AREA_OUTLINE, 'line-width': kind === 'city' ? 1.5 : 0.75, 'line-opacity': 0.5 } })
      }
      const onClick = (e: mapboxgl.MapMouseEvent) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ['neighborhood-fill', 'city-fill'] })[0]
        const p = hit?.properties as { placeId?: string; name?: string } | undefined
        if (p?.placeId && p.name) pick.current({ placeId: p.placeId, name: p.name })
      }
      map.on('click', onClick)
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer?.('neighborhood-fill')) return
    for (const kind of ['city', 'neighborhood']) {
      map.setPaintProperty(`${kind}-fill`, 'fill-opacity', ['case', ['==', ['get', 'placeId'], selectedPlaceId ?? ''], 0.25, 0.04])
    }
  }, [selectedPlaceId])

  if (!token) return null
  return (
    <div className="flex flex-col gap-1">
      <div ref={el} data-testid="area-pick-map" className="h-56 overflow-hidden rounded-md border border-[var(--color-border)]" />
      <p className="text-caption text-[var(--color-fg-muted)]">Or tap your neighbourhood on the map.</p>
    </div>
  )
}
