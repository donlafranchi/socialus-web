// #896 — what a Page's map shows and where its Maps links go. A Page that
// shares only an area, or moves, gets the area: never an exact point, address
// or Directions (Airbnb's approximate area; Google's service-area businesses).

import type { Placement } from './resolve-page-placement'
import type { PageWhere } from './page-where'
import type { MapsTarget } from '@/lib/maps/links'

export interface PageMapView {
  kind: 'point' | 'area'
  centre: [number, number]
  zoom: number
  text: string
  directions: boolean
}

const STYLE = 'mapbox/streets-v12'
const PIN = '24405a'
const AREA_RADIUS_M = 700
const round2 = (n: number) => Math.round(n * 100) / 100

export function pageMapView(placement: Placement | undefined, mode: PageWhere['mode'] | null): PageMapView | null {
  if (mode === 'roaming' || mode === 'travel') {
    // #894 — its anchor is only the metro: no fixed place, so no map.
    return null
  }
  const label = placement?.label.trim()
  if (!placement || !label) return null
  if (placement.kind === 'area') {
    return { kind: 'area', centre: [round2(placement.lng), round2(placement.lat)], zoom: 13, text: label, directions: false }
  }
  return { kind: 'point', centre: [placement.lng, placement.lat], zoom: 16, text: label, directions: true }
}

function circle([lng, lat]: [number, number], metres: number, steps = 32): [number, number][] {
  const dLat = metres / 111_320
  const dLng = dLat / Math.cos((lat * Math.PI) / 180)
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / steps
    return [r4(lng + dLng * Math.cos(a)), r4(lat + dLat * Math.sin(a))]
  })
}

export function staticMapUrl(v: PageMapView, token: string): string {
  const at = `${v.centre[0]},${v.centre[1]}`
  const overlay =
    v.kind === 'point'
      ? `pin-l+${PIN}(${at})/`
      : v.zoom >= 12
        ? `geojson(${encodeURIComponent(JSON.stringify({
            type: 'Feature',
            properties: { stroke: `#${PIN}`, 'stroke-width': 2, fill: `#${PIN}`, 'fill-opacity': 0.15 },
            geometry: { type: 'Polygon', coordinates: [circle(v.centre, AREA_RADIUS_M)] },
          }))})/`
        : ''
  return `https://api.mapbox.com/styles/v1/${STYLE}/static/${overlay}${at},${v.zoom},0/400x200@2x?access_token=${token}`
}

/** What Open in Maps / Directions point at: an area is never exact. */
export const mapsTargetOf = (v: PageMapView): MapsTarget => ({
  label: v.text, lng: v.centre[0], lat: v.centre[1], exact: v.kind === 'point', zoom: v.kind === 'area' ? v.zoom : undefined,
})
