// #556 — puts a Page's pictures in the media bucket, under the system member (the founder of every
// unclaimed Page), and returns their public addresses. Idempotent: the object name comes from the
// bytes, so a re-run writes the same file to the same place.
import { createHash } from 'node:crypto'
import { SYSTEM_MEMBER_ID } from '../system-member'
import type { Photo } from './photos'

interface Storage {
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Buffer, opts: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }>
      getPublicUrl: (path: string) => { data: { publicUrl: string } }
    }
  }
}

export interface Uploaded {
  url: string
  credit: string
  sourceUrl: string
  own: boolean
}

export async function uploadPhotos(client: Storage, slug: string, photos: Photo[]): Promise<Uploaded[]> {
  const bucket = client.storage.from('media')
  const out: Uploaded[] = []
  for (const p of photos) {
    const path = `${SYSTEM_MEMBER_ID}/unclaimed/${slug}/${createHash('sha1').update(p.data).digest('hex').slice(0, 12)}.webp`
    const { error } = await bucket.upload(path, p.data, { contentType: 'image/webp', upsert: true })
    if (error) throw new Error(`upload ${path}: ${error.message}`)
    out.push({ url: bucket.getPublicUrl(path).data.publicUrl, credit: p.credit, sourceUrl: p.sourceUrl, own: p.own })
  }
  return out
}
