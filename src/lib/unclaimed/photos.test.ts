import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { gatherPhotos, pickStock, stockPools, toWebp, type Fetch } from './photos'

/** A photo-like picture: noisy, many colours, any size. */
const noise = (w: number, h: number, seed = 1) => {
  const cw = 24
  const ch = 16
  const raw = Buffer.alloc(cw * ch * 3)
  let x = seed * 2654435761
  for (let i = 0; i < raw.length; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    raw[i] = (x >>> 24) & 255
  }
  return sharp(raw, { raw: { width: cw, height: ch, channels: 3 } }).resize(w, h, { kernel: 'cubic' }).jpeg({ quality: 90 }).toBuffer()
}
const flat = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } }).png().toBuffer()

const SITE = 'https://shop.example/'
const html = `<meta property="og:image" content="/a.jpg"><meta name="twitter:image" content="/b.jpg"><img src="/logo-banner.png"><img src="/flat.png"><img src="/small.jpg"><a href="tel:916-555-0142">c</a>`

function fake(extra: Record<string, () => Promise<Buffer>> = {}): Fetch {
  return async (url) => {
    const u = String(url)
    const send = (b: Buffer, type: string) => new Response(new Uint8Array(b), { status: 200, headers: { 'content-type': type } })
    if (u === SITE) return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
    if (u.endsWith('/a.jpg')) return send(await noise(1800, 1200, 1), 'image/jpeg')
    if (u.endsWith('/b.jpg')) return send(await noise(1800, 1200, 1), 'image/jpeg') // the same picture again
    if (u.endsWith('/flat.png')) return send(await flat(1600, 900), 'image/png')
    if (u.endsWith('/small.jpg')) return send(await noise(300, 200, 3), 'image/jpeg')
    if (u.includes('images.unsplash.com')) return send(await noise(1600, 1067, u.length + u.charCodeAt(40)), 'image/jpeg')
    for (const [k, v] of Object.entries(extra)) if (u.includes(k)) return send(await v(), 'image/jpeg')
    return new Response('nope', { status: 404 })
  }
}

describe('gatherPhotos (#556)', { timeout: 60_000 }, () => {
  it('leads with the business’s own picture, credited, and fills the rest with stock until there are four', async () => {
    const g = await gatherPhotos({ name: 'Shop', slug: 'shop-1', site: SITE, pool: 'Food & drink', fetchImpl: fake() })
    expect(g.photos).toHaveLength(4)
    expect(g.ownCount).toBe(1)
    expect(g.photos[0]).toMatchObject({ own: true, credit: 'Shop (from their website)', sourceUrl: SITE })
    expect(g.photos.slice(1).every((p) => !p.own && /Unsplash/.test(p.credit) && p.sourceUrl.startsWith('https://unsplash.com/photos/'))).toBe(true)
    expect(g.meta.phone).toBe('+19165550142')
  })
  it('drops a duplicate, a flat graphic and a thumbnail', async () => {
    const g = await gatherPhotos({ name: 'Shop', slug: 'shop-1', site: SITE, pool: 'Farm', fetchImpl: fake() })
    expect(g.ownCount).toBe(1)
  })
  it('still gives four pictures when the site cannot be read at all', async () => {
    const g = await gatherPhotos({ name: 'Shop', slug: 'shop-2', site: 'https://down.example/', pool: 'Ranch', fetchImpl: fake() })
    expect(g.siteDown).toBe(true)
    expect(g.photos).toHaveLength(4)
    expect(g.photos.every((p) => !p.own)).toBe(true)
  })
  it('can lead with a stock photo when the business’s own are posters', async () => {
    const g = await gatherPhotos({ name: 'Shop', slug: 'shop-1', site: SITE, pool: 'Food & drink', stockCover: true, fetchImpl: fake() })
    expect(g.photos[0]!.own).toBe(false)
    expect(g.photos.some((p) => p.own)).toBe(true)
  })
  it('writes WebP, longest edge 1600, with no metadata', async () => {
    const out = await toWebp(await noise(2400, 1600))
    const meta = await sharp(out!.data).metadata()
    expect(meta.format).toBe('webp')
    expect(Math.max(meta.width!, meta.height!)).toBe(1600)
    expect(meta.exif).toBeUndefined()
  })
})

describe('pickStock', () => {
  it('gives neighbouring Pages different pictures', () => {
    const a = pickStock('Food & drink', 'a', 4, 0).map((s) => s.id)
    const b = pickStock('Food & drink', 'b', 4, 1).map((s) => s.id)
    expect(a.filter((id) => b.includes(id)).length).toBeLessThan(3)
    expect(new Set(a).size).toBe(4)
  })
  it('has a pool behind every kind of business', () => {
    expect(Object.keys(stockPools).sort()).toEqual(['Cakes & bakery', 'Art & print', 'Farm', 'Farm stay & agritourism', 'Food & drink', 'Goods & crafts', 'Local business', 'Ranch', 'Repair & trades'].sort())
  })
})
