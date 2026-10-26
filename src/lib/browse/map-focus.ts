// #896 — Don, 2026-10-18: "shouldn't the map open our own map? Do we want people
// leaving the app." A Page's map opens Explore's map, on that Page.

export interface MapFocus {
  href: string
  at: [number, number]
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5

export const mapFocusHref = (publicId: string, [lng, lat]: [number, number]) =>
  `/explore?${new URLSearchParams({ view: 'map', focus: publicId, at: `${round5(lng)},${round5(lat)}` })}`

export function mapFocusFrom(params: URLSearchParams): MapFocus | null {
  const id = params.get('focus') ?? ''
  const at = (params.get('at') ?? '').split(',').map(Number)
  if (!/^[a-z0-9]{4,16}$/.test(id) || at.length !== 2) return null
  const [lng, lat] = at as [number, number]
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null
  return { href: `/g/${id}`, at: [lng, lat] }
}
