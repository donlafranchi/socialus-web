'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_DEFAULTS } from '@/lib/map-config'
import { itemHref, kindLabel } from '@/lib/feed/item-url'
import type { ExploreItem } from '@/lib/explore/items'

// T117 — one accent pin per Item. A per-kind colour ramp is a design decision
// the DLS does not carry yet, and PIN_COLORS is reserved for ownership tiers
// (web/CLAUDE.md § Design System); the kind is carried by the popup label.
// The marker is a real DOM node in the document, so the DLS token resolves.
const PIN_COLOR = 'var(--color-accent)'

export function ExploreMap({ items }: { items: ExploreItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [selected, setSelected] = useState<ExploreItem | null>(null)

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

    const bounds = new mapboxgl.LngLatBounds()
    let hasAny = false

    for (const item of items) {
      if (item.longitude == null || item.latitude == null) continue
      const el = document.createElement('div')
      el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${PIN_COLOR};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:pointer`
      el.setAttribute('data-testid', 'map-pin')
      el.setAttribute('data-item-id', item.itemId)
      el.setAttribute('data-item-kind', item.kind)
      el.addEventListener('click', () => setSelected(item))
      const marker = new mapboxgl.Marker(el).setLngLat([item.longitude, item.latitude]).addTo(map)
      markersRef.current.push(marker)
      bounds.extend([item.longitude, item.latitude])
      hasAny = true
    }

    if (hasAny) map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 })
  }, [items])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" data-testid="explore-map" />
      {selected && (
        <div className="absolute bottom-4 left-4 right-4 bg-white rounded-xl shadow-lg p-3 border border-neutral-200">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="chip text-[11px]">{kindLabel(selected.kind)}</span>
              <p className="font-medium text-neutral-900 truncate">{selected.title}</p>
              <p className="text-xs text-neutral-600 truncate">
                {selected.brandLabel ?? selected.ownerDisplayName}
                {selected.nearestLocationLabel && <> · {selected.nearestLocationLabel}</>}
              </p>
            </div>
            <Link
              href={itemHref({
                kind: selected.kind,
                ownerHandle: selected.ownerHandle,
                title: selected.title,
                itemId: selected.itemId,
              })}
              className="text-sm font-medium text-[var(--color-accent)] whitespace-nowrap"
            >
              View →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
