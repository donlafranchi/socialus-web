// F099.5 — a photo URL a handler accepts is an object the member uploaded to
// the media bucket, in their own folder, as WebP (upload-image.ts writes
// `${memberId}/${uuid}.webp`). Anything else is somebody else's file or a
// foreign host.
const OWN = (memberId: string) =>
  new RegExp(`^/storage/v1/object/public/media/${memberId}/[0-9a-f-]{36}\\.webp$`, 'i')

export function isOwnMediaUrl(url: string, memberId: string): boolean {
  try {
    const u = new URL(url)
    const local = u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)
    return (u.protocol === 'https:' || local) && !u.search && !u.hash && OWN(memberId).test(u.pathname)
  } catch {
    return false
  }
}
