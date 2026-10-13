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
