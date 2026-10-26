// #896 — what a Page's map shows and where Directions go. Only a Page at a
// street address or a landmark has a map; one that shares only an area, serves
// an area, moves or is online has none and never sends a point (Google's
// service-area businesses; Don, 2026-10-18).

import type { Placement } from './resolve-page-placement'
import type { PageWhere } from './page-where'
import type { MapsTarget } from '@/lib/maps/links'

export interface PageMapView {
  kind: 'point'
  centre: [number, number]
  zoom: number
  text: string
  directions: boolean
  /** #896 — a landmark: Maps searches and routes by its pin, not its words. */
  byCoords?: boolean
  /** #936 — a street address's business name: Directions find it by name at the address. */
  name?: string
}

const STYLE = 'mapbox/streets-v12'
const PIN = '24405a'

export function pageMapView(placement: Placement | undefined, mode: PageWhere['mode'] | null, name?: string): PageMapView | null {
  // #894 — it moves: no fixed place. #896 — Don, 2026-10-18: an area, a service area, more than one
  // location or online has no map at all, just a line saying where (and never a point).
  if (mode === 'roaming' || mode === 'travel' || mode === 'multi' || mode === 'online') return null
  const label = placement?.label.trim()
  if (!placement || !label || placement.kind === 'area') return null
  if (mode === 'landmark') return { kind: 'point', centre: [placement.lng, placement.lat], zoom: 16, text: label, directions: true, byCoords: true }
  return { kind: 'point', centre: [placement.lng, placement.lat], zoom: 16, text: label, directions: true, ...(name?.trim() ? { name: name.trim() } : {}) }
}

export function staticMapUrl(v: PageMapView, token: string): string {
  const at = `${v.centre[0]},${v.centre[1]}`
  return `https://api.mapbox.com/styles/v1/${STYLE}/static/pin-l+${PIN}(${at})/${at},${v.zoom},0/400x200@2x?access_token=${token}`
}

/** What Directions point at. */
export const mapsTargetOf = (v: PageMapView): MapsTarget => ({
  label: v.text, lng: v.centre[0], lat: v.centre[1], exact: v.kind === 'point', byCoords: v.byCoords, name: v.name,
})
