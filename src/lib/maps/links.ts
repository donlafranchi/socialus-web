// #896 — links that open a place in the phone's maps app: Apple Maps on iPhone
// and iPad, Google Maps everywhere else. An approximate place (an area) opens
// on its centre and never offers directions.

export interface MapsTarget {
  label: string
  lng: number
  lat: number
  /** false for an area: open on its centre, no directions. */
  exact: boolean
  zoom?: number
}

export function mapsLinks(t: MapsTarget, apple: boolean): { open: string; directions: string | null } {
  const q = encodeURIComponent(t.label)
  const ll = `${t.lat},${t.lng}`
  if (!t.exact) {
    return {
      open: apple ? `https://maps.apple.com/?q=${q}&ll=${ll}${t.zoom ? `&z=${t.zoom}` : ''}` : `https://www.google.com/maps/search/?api=1&query=${ll}`,
      directions: null,
    }
  }
  return apple
    ? { open: `https://maps.apple.com/?q=${q}&ll=${ll}`, directions: `https://maps.apple.com/?daddr=${q}` }
    : { open: `https://www.google.com/maps/search/?api=1&query=${q}`, directions: `https://www.google.com/maps/dir/?api=1&destination=${q}` }
}

/** iPhone, iPod, or an iPad (which reports itself as a Mac with touch). Client only. */
export const isAppleMobile = (nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator) =>
  /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
