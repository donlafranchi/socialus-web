// #641 — member photos are served from our own address so they pass through Cloudflare's cache, where its CSAM
// Scanning Tool checks them against known lists. The object and its path are the same; only the host changes,
// so isOwnMediaUrl and mediaObjectPath (both host-agnostic) keep working. Off until NEXT_PUBLIC_MEDIA_VIA_SITE=1,
// which is set only after the tool is enabled on the zone.

const MARKER = '/storage/v1/object/public/media/'

export function servedMediaUrl(url: string, { enabled, origin }: { enabled: boolean; origin: string }): string {
  if (!enabled) return url
  const i = url.indexOf(MARKER)
  return i < 0 ? url : `${origin}${url.slice(i)}`
}

/** True when this photo is on the site's own address (so scanned), false when still on the storage host or not a media URL. */
export function isServedViaSite(url: string | null | undefined, storageUrl: string | undefined): boolean {
  if (!url || !storageUrl || !url.includes(MARKER)) return false
  try {
    return new URL(url).origin !== new URL(storageUrl).origin
  } catch {
    return false
  }
}

/** The switch, read here so the upload module reads no environment at all (F080 guard). */
export const mediaViaSite = () => process.env.NEXT_PUBLIC_MEDIA_VIA_SITE === '1'

const OBJECT = '/storage/v1/object/public/media/'
const RENDER = '/storage/v1/render/image/public/media/'

/** A card shows a photo at a fraction of its stored 1600px; the storage host resizes it (WebP, cached) so the card downloads the fraction. Only hosted storage URLs change: local storage, the site's own address and foreign hosts pass through. */
export function sizedMediaUrl(url: string | null | undefined, width: number): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || !u.hostname.endsWith('.supabase.co') || !u.pathname.startsWith(OBJECT) || u.search) return url
    return `${u.origin}${RENDER}${u.pathname.slice(OBJECT.length)}?width=${width}&quality=70`
  } catch {
    return url
  }
}

/** `srcSet` for a card: this width for 1x screens (desktop, bots), double for 2x (phones). */
export function sizedMediaSrcSet(url: string | null | undefined, width: number): string | undefined {
  const one = sizedMediaUrl(url, width)
  const two = sizedMediaUrl(url, width * 2)
  return one && two && one !== url ? `${one} 1x, ${two} 2x` : undefined
}
