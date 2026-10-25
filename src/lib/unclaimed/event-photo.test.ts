import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { eventPhoto, pickEventStock } from './event-photo'
import { STOCK_CREDIT, type Fetch, type Photo } from './photos'

const noise = (w: number, h: number) => {
  const raw = Buffer.alloc(24 * 16 * 3)
  let x = 7 * 2654435761
  for (let i = 0; i < raw.length; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    raw[i] = (x >>> 24) & 255
  }
  return sharp(raw, { raw: { width: 24, height: 16, channels: 3 } }).resize(w, h, { kernel: 'cubic' }).jpeg({ quality: 90 }).toBuffer()
}
const fetchOf = (hits: string[]): Fetch => async (url) => {
  hits.push(String(url))
  return new Response(new Uint8Array(await noise(1200, 800)), { status: 200, headers: { 'content-type': 'image/jpeg' } })
}
const upload = async (p: Photo) => ({ url: `https://media.test/${p.own ? 'own' : 'stock'}.webp`, credit: p.credit, sourceUrl: p.sourceUrl, own: p.own })

describe('eventPhoto (#1045)', () => {
  const base = { venue: 'Hall', key: '2026-11-07|karan aujla', upload }
  it("uses the venue's own image for the event, credited to the venue", async () => {
    const hits: string[] = []
    const p = await eventPhoto({ ...base, type: 'music', show: { title: 'Karan Aujla', startsAt: new Date(), imageUrl: 'https://hall.test/a.jpg' }, fetchImpl: fetchOf(hits) })
    expect(p).toEqual({ url: 'https://media.test/own.webp', credit: 'Hall (from their website)' })
    expect(hits).toEqual(['https://hall.test/a.jpg'])
  })
  it("never uses the venue's image for a game (those cards are team logos): stock arena instead", async () => {
    const hits: string[] = []
    const p = await eventPhoto({ ...base, type: 'sports', show: { title: 'Grizzlies vs Kings', startsAt: new Date(), imageUrl: 'https://hall.test/mem.jpg' }, fetchImpl: fetchOf(hits) })
    expect(p).toEqual({ url: 'https://media.test/stock.webp', credit: STOCK_CREDIT })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('images.unsplash.com')
  })
  it('falls back to stock for the type when the own image will not load', async () => {
    const fail: Fetch = async (u) => (String(u).includes('hall.test') ? new Response('no', { status: 404 }) : new Response(new Uint8Array(await noise(1200, 800)), { status: 200, headers: { 'content-type': 'image/jpeg' } }))
    const p = await eventPhoto({ ...base, type: 'comedy', show: { title: 'Open Mic', startsAt: new Date(), imageUrl: 'https://hall.test/x.jpg' }, fetchImpl: fail })
    expect(p?.credit).toBe(STOCK_CREDIT)
  })
  it('gives nothing for an event of no known type with no image (it keeps the Page picture)', async () => {
    expect(await eventPhoto({ ...base, type: 'other', show: { title: 'Gathering', startsAt: new Date() }, fetchImpl: fetchOf([]) })).toBeNull()
  })
})

describe('pickEventStock', () => {
  it('is steady for a key, varies across keys, and has a picture for each type but other', () => {
    expect(pickEventStock('sports', 'a')).toEqual(pickEventStock('sports', 'a'))
    expect(new Set(Array.from({ length: 20 }, (_, i) => pickEventStock('sports', `k${i}`)!.id)).size).toBeGreaterThan(3)
    expect(pickEventStock('other', 'a')).toBeNull()
    for (const t of ['sports', 'music', 'comedy', 'family', 'theater'] as const) expect(pickEventStock(t, 'x')).not.toBeNull()
  })
})
