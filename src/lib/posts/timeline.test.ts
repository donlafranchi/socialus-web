import { describe, expect, it } from 'vitest'
import { pageTimeline } from './timeline'

const now = new Date('2026-11-01T20:00:00.000Z')
const post = (id: string, o: { createdAt?: string; startsAt?: string | null; endsAt?: string | null; current?: boolean } = {}) => ({
  id,
  createdAt: o.createdAt ?? '2026-10-30T12:00:00.000Z',
  startsAt: o.startsAt ?? null,
  endsAt: o.endsAt ?? null,
  current: o.current,
})
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

// plan #230 (Don, 10-31) — a timeline anchored at now: past above, latest at now, coming up below.
describe('pageTimeline', () => {
  it('coming up: dated posts not yet started, soonest first', () => {
    const t = pageTimeline([post('far', { startsAt: '2026-11-20T02:00:00.000Z' }), post('soon', { startsAt: '2026-11-02T02:00:00.000Z' })], now)
    expect(ids(t.upcoming)).toEqual(['soon', 'far'])
    expect(t.past).toEqual([])
    expect(t.latest).toEqual([])
  })

  it('past: ended events and undated posts past their window, oldest first so the newest sits nearest now', () => {
    const t = pageTimeline(
      [
        post('stale', { createdAt: '2026-10-20T12:00:00.000Z', current: false }),
        post('ended', { startsAt: '2026-10-25T02:00:00.000Z', endsAt: '2026-10-25T04:00:00.000Z' }),
        post('older', { createdAt: '2026-09-01T12:00:00.000Z', current: false }),
      ],
      now,
    )
    expect(ids(t.past)).toEqual(['older', 'stale', 'ended'])
  })

  it('a dated post with no end has passed once it starts', () => {
    expect(ids(pageTimeline([post('e', { startsAt: '2026-11-01T19:00:00.000Z' })], now).past)).toEqual(['e'])
  })

  it('at now: current undated posts and anything happening now, newest first', () => {
    const t = pageTimeline(
      [
        post('news-old', { createdAt: '2026-10-28T12:00:00.000Z' }),
        post('sale', { createdAt: '2026-10-29T12:00:00.000Z', startsAt: '2026-10-29T12:00:00.000Z', endsAt: '2026-11-05T12:00:00.000Z' }),
        post('news-new', { createdAt: '2026-10-31T12:00:00.000Z' }),
      ],
      now,
    )
    expect(ids(t.latest)).toEqual(['news-new', 'sale', 'news-old'])
  })
})
