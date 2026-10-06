'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { stylePin } from '@/lib/map-pins'
import type { OwnershipTier } from '@/lib/types'

interface MapPreviewProps {
  latitude: number
  longitude: number
  ownershipTier: OwnershipTier
}

export function MapPreview({ latitude, longitude }: MapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [longitude, latitude],
      zoom: 14,
      interactive: false,
    })

    // Every pin is navy (Don, 2026-10-05); ownership no longer colours pins.
    const el = document.createElement('div')
    stylePin(el)
    el.style.cursor = ''

    new mapboxgl.Marker({ element: el }).setLngLat([longitude, latitude]).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [latitude, longitude])

  return (
    <div
      data-testid="map-preview"
      ref={containerRef}
      className="w-full h-48 rounded-md overflow-hidden"
    />
  )
}
