'use client'

// #413 — put the pin on the front door: drag it, or tap the map where it goes
// (Google Business Profile's "Business location", Airbnb's listing location).
// Replaces #348's fixed centre pin under a panned map.

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_DEFAULTS } from '@/lib/map-config'

type LngLat = [number, number]
const round = (c: { lng: number; lat: number }): LngLat => [Number(c.lng.toFixed(6)), Number(c.lat.toFixed(6))]
const same = (a: LngLat, b: LngLat) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6

const PIN_SVG =
  '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z" fill="currentColor" stroke="var(--color-pin-edge)" stroke-width="1.5"/><circle cx="12" cy="9" r="2.5" fill="var(--color-pin-edge)"/></svg>'

export function PinAdjustMap({ center, onChange }: { center: LngLat; onChange: (coords: LngLat) => void }) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const el = useRef<HTMLDivElement>(null)
  const report = useRef(onChange)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  // Where the pin is now. A `center` equal to it is our own report coming back.
  const at = useRef(center)
  useEffect(() => {
    report.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!token || !el.current) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({ container: el.current, style: MAP_DEFAULTS.style, center: at.current, zoom: 16 })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }))
    const pin = document.createElement('div')
    pin.className = 'size-tap flex cursor-grab items-end justify-center text-[var(--color-pin)]'
    pin.innerHTML = PIN_SVG
    const marker = new mapboxgl.Marker({ element: pin, draggable: true, anchor: 'bottom' }).setLngLat(at.current).addTo(map)
    pin.setAttribute('aria-label', 'Front door pin')
    const moved = (c: LngLat) => {
      at.current = c
      report.current(c)
    }
    marker.on('dragend', () => moved(round(marker.getLngLat())))
    map.on('click', (e: mapboxgl.MapMouseEvent) => {
      const c = round(e.lngLat)
      marker.setLngLat(c)
      moved(c)
    })
    mapRef.current = map
    markerRef.current = marker
    return () => {
      marker.remove()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [token])

  const [lng, lat] = center
  useEffect(() => {
    const next: LngLat = [lng, lat]
    if (same(next, at.current)) return
    at.current = next
    markerRef.current?.setLngLat(next)
    mapRef.current?.easeTo({ center: next })
  }, [lng, lat])

  if (!token) {
    return (
      <p data-testid="pin-adjust" className="text-caption text-[var(--color-fg-muted)]">
        The map isn&rsquo;t available here, so the pin goes on the address as found.
      </p>
    )
  }
  return (
    <div data-testid="pin-adjust" className="flex flex-col gap-1">
      <div ref={el} className="h-56 overflow-hidden rounded-md border border-[var(--color-border)]" />
      <p className="text-caption text-[var(--color-fg-muted)]">Drag the pin to your front door, or tap the map where it is.</p>
    </div>
  )
}
