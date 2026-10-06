'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_DEFAULTS, CLUSTER_CONFIG } from '@/lib/map-config'
import { stylePin, styleCluster } from '@/lib/map-pins'
import { useMapPages, type Bounds, type MapPage } from '@/hooks/useMapPages'
import { SearchBar } from './SearchBar'
import { PageDetailCard } from './group/PageDetailCard'

const SOURCE_ID = 'pages'


function pagesToGeoJSON(pages: MapPage[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pages
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.longitude!, p.latitude!] },
        properties: { id: p.id, name: p.name, kind: p.kind, category: p.category },
      })),
  }
}

export function Map() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({})
  const pagesRef = useRef<MapPage[]>([])
  const [selectedPage, setSelectedPage] = useState<MapPage | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  // The selected pin is gold (the highlight); every other pin and cluster navy.
  useEffect(() => {
    selectedIdRef.current = selectedPage?.id ?? null
    for (const [key, marker] of Object.entries(markersRef.current)) {
      if (key.startsWith('pin-')) stylePin(marker.getElement(), { selected: key === `pin-${selectedPage?.id}` })
    }
  }, [selectedPage])
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [noResultsQuery, setNoResultsQuery] = useState<string | null>(null)
  const categoryFilterRef = useRef<string | null>(null)
  const { pages, fetchPages } = useMapPages()

  const getBounds = useCallback((): Bounds | null => {
    const map = mapRef.current
    if (!map) return null
    const b = map.getBounds()
    if (!b) return null
    return {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    }
  }, [])

  const refreshPins = useCallback(() => {
    const bounds = getBounds()
    if (bounds) fetchPages(bounds, categoryFilterRef.current || undefined)
  }, [getBounds, fetchPages])

  // Initialize map
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

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: CLUSTER_CONFIG.clusterMaxZoom,
        clusterRadius: CLUSTER_CONFIG.clusterRadius,
      })

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: { 'circle-radius': 0, 'circle-opacity': 0 },
      })

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': 0, 'circle-opacity': 0 },
      })

      const bounds = getBounds()
      if (bounds) fetchPages(bounds)
    })

    map.on('moveend', () => {
      const bounds = getBounds()
      if (bounds) fetchPages(bounds, categoryFilterRef.current || undefined)
    })

    map.on('render', () => {
      if (!map.getSource(SOURCE_ID) || !map.isSourceLoaded(SOURCE_ID)) return
      // eslint-disable-next-line react-hooks/immutability -- tracked in #119
      updateMarkers(map)
    })

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: MAP_DEFAULTS.geolocatedZoom,
          })
        },
        () => {}
      )
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  function updateMarkers(map: mapboxgl.Map) {
    const features = map.querySourceFeatures(SOURCE_ID)
    const newMarkerIds = new Set<string>()

    for (const feature of features) {
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      const props = feature.properties!

      if (props.cluster) {
        const clusterId = props.cluster_id as number
        const count = props.point_count as number
        const key = `cluster-${clusterId}`
        newMarkerIds.add(key)

        if (!markersRef.current[key]) {
          const el = document.createElement('div')
          el.setAttribute('data-testid', 'map-cluster')
          styleCluster(el, count)

          el.addEventListener('click', (e) => {
            e.stopPropagation()
            const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource
            source.getClusterExpansionZoom(clusterId, (_err, zoom) => {
              if (zoom != null) map.flyTo({ center: coords, zoom })
            })
          })

          const marker = new mapboxgl.Marker({ element: el }).setLngLat(coords).addTo(map)
          markersRef.current[key] = marker
        }
      } else {
        const id = props.id as string
        const key = `pin-${id}`
        newMarkerIds.add(key)

        if (!markersRef.current[key]) {
          const el = document.createElement('div')
          el.setAttribute('data-testid', 'map-pin')
          el.setAttribute('data-kind', String(props.kind ?? ''))
          el.setAttribute('data-page-id', id)
          stylePin(el, { selected: id === selectedIdRef.current })

          el.addEventListener('click', (e) => {
            e.stopPropagation()
            const page = pagesRef.current.find((p) => p.id === id)
            if (page) setSelectedPage(page)
          })

          const marker = new mapboxgl.Marker({ element: el }).setLngLat(coords).addTo(map)
          markersRef.current[key] = marker
        }
      }
    }

    for (const key of Object.keys(markersRef.current)) {
      if (!newMarkerIds.has(key)) {
        markersRef.current[key].remove()
        delete markersRef.current[key]
      }
    }
  }

  // Update GeoJSON source when pages change
  useEffect(() => {
    pagesRef.current = pages

    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined
    if (!source) return

    for (const key of Object.keys(markersRef.current)) {
      markersRef.current[key].remove()
      delete markersRef.current[key]
    }

    source.setData(pagesToGeoJSON(pages))

    // Fit map bounds to results when a category filter is active
    if (categoryFilterRef.current && pages.length > 0) {
      const coords = pages
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => [p.longitude!, p.latitude!] as [number, number])

      if (coords.length > 0) {
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new mapboxgl.LngLatBounds(coords[0], coords[0])
        )
        map.fitBounds(bounds, { padding: 60, maxZoom: 15 })
      }
    }
  }, [pages])

  // Search callbacks
  const handleCategorySelect = useCallback((category: string) => {
    setCategoryFilter(category)
    categoryFilterRef.current = category
    setNoResultsQuery(null)
    // Pass null bounds so the query fetches all matching pages globally
    fetchPages(null, category)
  }, [fetchPages])

  const handleLocationSelect = useCallback((coordinates: [number, number]) => {
    setNoResultsQuery(null)
    mapRef.current?.flyTo({ center: coordinates, zoom: MAP_DEFAULTS.geolocatedZoom })
  }, [])

  const handleCombinedSelect = useCallback((category: string, coordinates: [number, number]) => {
    setCategoryFilter(category)
    categoryFilterRef.current = category
    setNoResultsQuery(null)
    mapRef.current?.flyTo({ center: coordinates, zoom: MAP_DEFAULTS.geolocatedZoom })
  }, [])

  const handleSearchClear = useCallback(() => {
    setCategoryFilter(null)
    categoryFilterRef.current = null
    setNoResultsQuery(null)
    refreshPins()
  }, [refreshPins])

  const handleNoResults = useCallback((query: string) => {
    setNoResultsQuery(query)
  }, [])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} data-testid="map" className="h-full w-full" />

      <SearchBar
        onCategorySelect={handleCategorySelect}
        onLocationSelect={handleLocationSelect}
        onCombinedSelect={handleCombinedSelect}
        onClear={handleSearchClear}
        onNoResults={handleNoResults}
      />

      {noResultsQuery && (
        <div
          data-testid="search-no-results"
          className="absolute bottom-24 left-4 right-4 z-20 bg-white dark:bg-zinc-900 rounded-md shadow-overlay px-4 py-3 text-sm text-center text-zinc-600 dark:text-zinc-400"
        >
          No &ldquo;{noResultsQuery}&rdquo; pages found in this area
        </div>
      )}

      {selectedPage && (
        <PageDetailCard
          page={selectedPage}
          onClose={() => setSelectedPage(null)}
        />
      )}
    </div>
  )
}
