// F081 ruling 2026-11-25 (the PM): a visitor's area is guessed from where their connection comes from, then
// confirmed. The guess is Vercel's own city-level lookup of the request (x-vercel-ip-latitude / -longitude),
// read for this request only: never stored, never logged, never sent to the browser.
// Precedents: Craigslist and Eventbrite open on the city your connection comes from, with a way to change it.

import { headers } from 'next/headers'

type H = { get(name: string): string | null }

/** [lng, lat], or null when the header is missing or not a real coordinate (local dev, CI, a lookup miss). */
export function ipPointFrom(h: H): [number, number] | null {
  const lat = Number(h.get('x-vercel-ip-latitude'))
  const lng = Number(h.get('x-vercel-ip-longitude'))
  if (!h.get('x-vercel-ip-latitude') || !h.get('x-vercel-ip-longitude')) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return [lng, lat]
}

/** The current request's guessed point, or null outside a request. */
export async function requestIpPoint(): Promise<[number, number] | null> {
  try {
    return ipPointFrom(await headers())
  } catch {
    return null
  }
}
