// #491 — the object path inside the `media` bucket, from a Page's stored
// photo URL. Null for anything that is not a media object, so a purge can never
// be pointed at another bucket or another host.

const MARKER = '/storage/v1/object/public/media/'

export function mediaObjectPath(url: string | null | undefined): string | null {
  if (!url) return null
  const i = url.indexOf(MARKER)
  if (i < 0) return null
  const path = url.slice(i + MARKER.length).split(/[?#]/)[0]!
  if (!path || path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return null
  return path
}
