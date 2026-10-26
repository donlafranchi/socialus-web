// #896 — links that open a place in the phone's maps app: Apple Maps on iPhone
// and iPad, Google Maps everywhere else. An approximate place (an area) opens
// on its centre and never offers directions; a place known only by its words
// (a market stall's "where") opens a search for them.

export interface MapsTarget {
  label: string
  /** Absent for a place known only by its words. */
  lng?: number
  lat?: number
  /** false for an area: open on its centre, no directions. Default true. */
  exact?: boolean
  /** A landmark: its words wouldn't find it, so search and route by the pin. */
  byCoords?: boolean
  zoom?: number
  /** #936 — the business's name: Maps finds it by name at its address, not just the address. */
  name?: string
}

export function mapsLinks(t: MapsTarget, apple: boolean): { open: string; directions: string | null } {
  const q = encodeURIComponent(t.label)
  const ll = t.lng !== undefined && t.lat !== undefined ? `${t.lat},${t.lng}` : null
  if (t.exact === false && ll) {
    return {
      open: apple ? `https://maps.apple.com/?q=${q}&ll=${ll}${t.zoom ? `&z=${t.zoom}` : ''}` : `https://www.google.com/maps/search/?api=1&query=${ll}`,
      directions: null,
    }
  }
  if (t.name?.trim() && !t.byCoords) {
    const both = encodeURIComponent(`${t.name.trim()}, ${t.label}`)
    return apple
      ? { open: `https://maps.apple.com/?q=${encodeURIComponent(t.name.trim())}&address=${q}`, directions: `https://maps.apple.com/?daddr=${q}` }
      : { open: `https://www.google.com/maps/search/?api=1&query=${both}`, directions: `https://www.google.com/maps/dir/?api=1&destination=${both}` }
  }
  const to = t.byCoords && ll ? ll : q
  if (apple) return { open: `https://maps.apple.com/?q=${q}${ll ? `&ll=${ll}` : ''}`, directions: `https://maps.apple.com/?daddr=${to}` }
  return { open: `https://www.google.com/maps/search/?api=1&query=${to}`, directions: `https://www.google.com/maps/dir/?api=1&destination=${to}` }
}

/** iPhone, iPod, or an iPad (which reports itself as a Mac with touch). Client only. */
export const isAppleMobile = (nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator) =>
  /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
