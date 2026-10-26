// #1045 — the picture on an imported show's post. Eventbrite, Meetup and Google Events lead with the event's own image and fall back to
// a picture that fits the kind of event; none shows the venue's cover for a game. Same here, with two limits (Don, 2026-10-24):
// no team or league logos, and no identifiable pro players except a venue's own promo for a concert, credited.
import { createHash } from 'node:crypto'
import { EVENT_POOL, type EventType } from './event-type'
import { download, STOCK_CREDIT, toWebp, type Fetch, type Photo } from './photos'
import type { Uploaded } from './upload'
import type { VenueShow } from './venue-events'
import stockEvents from '../../../scripts/unclaimed/stock-events.json'

const pools = stockEvents as Record<string, { id: string; page: string }[]>
const MIN_WIDTH = 600

export function pickEventStock(type: EventType, key: string): { id: string; page: string } | null {
  const pool = EVENT_POOL[type]
  const list = pool ? pools[pool] : undefined
  return list?.length ? list[parseInt(createHash('sha1').update(key).digest('hex').slice(0, 8), 16) % list.length]! : null
}

export interface EventPhotoOptions {
  show: VenueShow
  type: EventType
  venue: string
  /** The post's event_key: the same show always draws the same stock picture. */
  key: string
  upload: (photo: Photo) => Promise<Uploaded>
  fetchImpl?: Fetch
}

/** The venue's own image for the show (not for a game: those are team-logo cards), else stock for the type, else nothing. */
export async function eventPhoto({ show, type, venue, key, upload, fetchImpl = fetch }: EventPhotoOptions): Promise<{ url: string; credit: string } | null> {
  let photo: Photo | null = null
  if (show.imageUrl && type !== 'sports') {
    const raw = await download(show.imageUrl, fetchImpl)
    const p = raw && (await toWebp(raw, { strict: false }))
    if (p && p.width >= MIN_WIDTH) photo = { ...p, sourceUrl: show.ticketUrl ?? show.imageUrl, credit: `${venue} (from their website)`, own: true }
  }
  if (!photo) {
    const s = pickEventStock(type, key)
    const raw = s && (await download(`https://images.unsplash.com/photo-${s.id}?w=1600&q=80&fm=jpg&fit=max`, fetchImpl))
    const p = raw && (await toWebp(raw, { strict: false }))
    if (s && p) photo = { ...p, sourceUrl: `https://unsplash.com/photos/${s.page}`, credit: STOCK_CREDIT, own: false }
  }
  if (!photo) return null
  const up = await upload(photo)
  return { url: up.url, credit: up.credit }
}
