// #348 — a dropped pin with no address is named by what's around it ("Near
// Curtis Park"), as Google Maps names a dropped pin, never "Pinned spot".

import { placeForPointAction } from '@/app/_actions/location-actions'

/** What the shared picker calls a pin until it's saved and named. */
export const DROPPED_PIN = 'Dropped pin'

export async function pinLabel(lng: number, lat: number): Promise<string> {
  const res = await placeForPointAction(lng, lat).catch(() => null)
  return res && res.ok && res.data ? `Near ${res.data.name}` : DROPPED_PIN
}
