// #556 — pictures for an unclaimed Page: the business's own first (its homepage's declared and
// on-page photos, credited to it), then free-license stock that matches its category. Every
// picture is downloaded, checked, re-encoded to WebP (the media bucket takes nothing else; the
// re-encode also strips EXIF/GPS) and returned as bytes, so a Page never hot-links anyone.
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { extractSiteMeta, type SiteMeta } from './site-scrape'
import stock from '../../../scripts/unclaimed/stock.json'

export interface Photo {
  data: Buffer
  width: number
  height: number
  /** Where it came from: the business's own page, or the stock photo's page. */
  sourceUrl: string
  credit: string
  own: boolean
  /** Average hash, to drop near-duplicates. */
  ahash: string
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const UA = 'Mozilla/5.0 (compatible; SocialUsBot/1.0; +https://www.socialus.org/about)'
const MAX_BYTES = 14 * 1024 * 1024
const MIN_COVER_WIDTH = 900

export const STOCK_CREDIT = 'Unsplash (stock photo, not this business)'
export const stockPools = stock as Record<string, { id: string; page: string }[]>

async function get(url: string, f: Fetch, timeoutMs: number, accept: string): Promise<Response | null> {
  try {
    const r = await f(url, { headers: { 'user-agent': UA, accept }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
    return r.ok ? r : null
  } catch {
    return null
  }
}

export async function fetchHtml(url: string, f: Fetch = fetch): Promise<string | null> {
  const r = await get(url, f, 20_000, 'text/html,*/*;q=0.5')
  if (!r) return null
  const type = r.headers.get('content-type') ?? ''
  if (type && !/html|xml/i.test(type)) return null
  return (await r.text()).slice(0, 2_000_000)
}

/** Decode, orient, resize (longest edge 1600, never upscale), re-encode as WebP. Null when it is not a usable photo. */
export async function toWebp(input: Buffer, { minWidth = MIN_COVER_WIDTH, strict = true } = {}): Promise<Omit<Photo, 'sourceUrl' | 'credit' | 'own'> | null> {
  try {
    const img = sharp(input, { failOn: 'error', limitInputPixels: 120_000_000 }).rotate()
    const meta = await img.metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    if (strict) {
      if (w < minWidth || h < 500) return null
      const ratio = w / h
      if (ratio < 0.7 || ratio > 2.6) return null
      // A flat graphic (a logo on white, a text card) has almost no tonal range.
      const stats = await sharp(input).rotate().resize(64, 64, { fit: 'inside' }).greyscale().stats()
      if ((stats.channels[0]?.stdev ?? 0) < 28) return null
      // Nor is a promo card or a screenshot: one flat colour fills a third of it.
      const px = await sharp(input).rotate().resize(48, 48, { fit: 'fill' }).removeAlpha().raw().toBuffer()
      const buckets = new Map<number, number>()
      for (let i = 0; i < px.length; i += 3) {
        const k = ((px[i]! >> 4) << 8) | ((px[i + 1]! >> 4) << 4) | (px[i + 2]! >> 4)
        buckets.set(k, (buckets.get(k) ?? 0) + 1)
      }
      if (Math.max(...buckets.values()) / (px.length / 3) > 0.3) return null
    }
    const out = await img.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true })
    if (out.data.length > 4.5 * 1024 * 1024) return null
    const tiny = await sharp(out.data).resize(8, 8, { fit: 'fill' }).greyscale().raw().toBuffer()
    const avg = tiny.reduce((a, b) => a + b, 0) / tiny.length
    const ahash = [...tiny].map((v) => (v >= avg ? '1' : '0')).join('')
    return { data: out.data, width: out.info.width, height: out.info.height, ahash }
  } catch {
    return null
  }
}

export const sameImage = (a: string, b: string) => [...a].filter((c, i) => c !== b[i]).length <= 5

async function download(url: string, f: Fetch): Promise<Buffer | null> {
  const r = await get(url, f, 25_000, 'image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5')
  if (!r) return null
  const type = r.headers.get('content-type') ?? ''
  if (type && !/^image\/(jpeg|jpg|png|webp)/i.test(type)) return null
  const len = Number(r.headers.get('content-length') ?? '0')
  if (len > MAX_BYTES) return null
  const buf = Buffer.from(await r.arrayBuffer())
  return buf.length > MAX_BYTES || buf.length < 15_000 ? null : buf
}

const hash32 = (s: string) => parseInt(createHash('sha1').update(s).digest('hex').slice(0, 8), 16)

/**
 * Stock photos for a pool. `slot` is the Page's place among the Pages of that pool: consecutive slots start on
 * different pictures and step by different amounts, so Pages side by side in Explore do not wear the same cover.
 */
export function pickStock(pool: string, slug: string, count: number, slot = hash32(slug)) {
  const list = stockPools[pool] ?? stockPools['Local business']!
  const step = [7, 3, 9, 11][slot % 4]!
  return Array.from({ length: Math.min(count, list.length) }, (_, i) => list[(slot + i * step) % list.length]!)
}

export interface Gathered {
  photos: Photo[]
  ownCount: number
  meta: SiteMeta
  /** The homepage could not be read at all. */
  siteDown: boolean
}

export interface GatherOptions {
  name: string
  slug: string
  site: string
  pool: string
  /** Pictures wanted in all: one cover and the gallery behind it. */
  want?: number
  /** See pickStock. */
  slot?: number
  /** The business's own pictures are mostly graphics (posters, promos): lead with a stock photo, keep theirs behind it. */
  stockCover?: boolean
  fetchImpl?: Fetch
}

export async function gatherPhotos({ name, slug, site, pool, want: wantIn = 4, slot, stockCover = false, fetchImpl = fetch }: GatherOptions): Promise<Gathered> {
  // Some small sites answer on plain http only (their certificate is wrong or missing): read them, never link them.
  let want = wantIn
  const html = (await fetchHtml(site, fetchImpl)) ?? (await fetchHtml(site.replace(/^https:/, 'http:'), fetchImpl))
  const meta: SiteMeta = html ? extractSiteMeta(html, site) : { images: [], phone: null, social: {} }
  const photos: Photo[] = []
  const fits = (p: { ahash: string }) => !photos.some((q) => sameImage(q.ahash, p.ahash))

  for (const url of meta.images.slice(0, 14)) {
    if (photos.length >= want) break
    const raw = await download(url, fetchImpl)
    const p = raw && (await toWebp(raw))
    if (p && fits(p)) photos.push({ ...p, sourceUrl: site, credit: `${name} (from their website)`, own: true })
  }
  const ownCount = photos.length
  if (stockCover) want += 1

  for (const s of pickStock(pool, slug, want * 2, slot)) {
    if (photos.length >= want) break
    const raw = await download(`https://images.unsplash.com/photo-${s.id}?w=1600&q=80&fm=jpg&fit=max`, fetchImpl)
    const p = raw && (await toWebp(raw, { strict: false }))
    if (p && fits(p)) photos.push({ ...p, sourceUrl: `https://unsplash.com/photos/${s.page}`, credit: STOCK_CREDIT, own: false })
  }
  // The cover is the first one: the Page crops it to 2:1 (3:1 wide), so a landscape picture leads, the business's own first.
  const landscape = (p: Photo) => p.width / p.height >= (p.own ? 0.95 : 1.25)
  photos.sort((a, b) => Number(landscape(b)) - Number(landscape(a)))
  if (stockCover && photos[0]?.own) {
    const i = photos.findIndex((p) => !p.own && landscape(p))
    if (i > 0) photos.unshift(...photos.splice(i, 1))
  }
  return { photos, ownCount, meta, siteDown: !html }
}
