import { createClient } from '@/lib/supabase'

const BUCKET = 'media'
const MAX_EDGE = 1600
const WEBP_QUALITY = 0.82
// The bucket's real file_size_limit (039_media_bucket.sql) applies to the
// STORED object — the resized, re-encoded WebP — not the original upload.
// A phone photo routinely arrives well over this before processing and
// comes out well under it after; gating on the pre-resize size would
// reject the ordinary case this module exists to accept.
const MAX_STORED_BYTES = 5 * 1024 * 1024
// A generous pre-check only to avoid asking the canvas to decode something
// absurd (a mis-selected video file, a multi-hundred-MB scan) — not the
// real limit.
const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const ENCODE_TIMEOUT_MS = 15_000

export type UploadErrorCode = 'too-large' | 'wrong-type' | 'network' | 'canvas-unavailable'

export class UploadError extends Error {
  code: UploadErrorCode
  constructor(code: UploadErrorCode, message: string) {
    super(message)
    this.name = 'UploadError'
    this.code = code
  }
}

// Resize (longest edge <= 1600px, never upscale) and re-encode to WebP via
// canvas. This re-encode IS the EXIF strip, not a side effect of it — canvas
// pixel data carries no metadata channel, so anything drawn through it loses
// the source file's EXIF/GPS block by construction. Do not "optimize" this
// into a byte copy or swap in a library that preserves metadata; the privacy
// commitment in policy.md § Uploaded images depends on this exact path.
export async function resizeAndEncode(file: File): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new UploadError('too-large', 'That file is too large to process.')
  }
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    throw new UploadError('canvas-unavailable', 'This browser cannot process images.')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new UploadError('wrong-type', 'That file is not a readable image.')
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new UploadError('canvas-unavailable', 'This browser cannot process images.')
  }

  ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, width, height)

  // toBlob is spec'd to always invoke its callback exactly once, but a
  // hang here (a lost rendering context, a constrained embedded browser)
  // would otherwise leave the caller with no error at all — the one
  // outcome the acceptance criterion rules out. A bounded timeout turns
  // silence into a typed error instead.
  const blob = await Promise.race([
    new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
    }),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new UploadError('canvas-unavailable', 'Image encoding timed out.')),
        ENCODE_TIMEOUT_MS,
      )
    }),
  ])
  if (!blob) {
    throw new UploadError('canvas-unavailable', 'Could not encode the image.')
  }
  if (blob.size > MAX_STORED_BYTES) {
    throw new UploadError('too-large', 'That photo is too large even after resizing.')
  }
  return blob
}

// Upload one image for a Member. One module, every caller — the Page photo
// step, the F056 editor's replacement control, and Item photos when they
// resume all go through this function, so the EXIF and bucket-restriction
// guarantees hold in exactly one place (F061 review binding note 1).
export async function uploadImage(file: File, memberId: string): Promise<{ url: string }> {
  const blob = await resizeAndEncode(file)
  const path = `${memberId}/${crypto.randomUUID()}.webp`

  const supabase = createClient()
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/webp',
  })
  if (error) {
    throw new UploadError('network', error.message)
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}

// No-op on a URL outside this bucket — callers may hold URLs from other
// sources (or none at all) and shouldn't have to check first.
export async function deleteImage(url: string): Promise<void> {
  const path = extractMediaPath(url)
  if (!path) return

  const supabase = createClient()
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) {
    throw new UploadError('network', error.message)
  }
}

function extractMediaPath(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  // Strip any query string or hash a caller may have appended (e.g. a
  // display-time cache-buster) before matching — otherwise the extracted
  // "path" carries the suffix and remove() targets a key that was never
  // stored, silently leaving the real object orphaned.
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    pathname = url.split('?')[0].split('#')[0]
  }
  const idx = pathname.indexOf(marker)
  if (idx === -1) return null
  return pathname.slice(idx + marker.length)
}
