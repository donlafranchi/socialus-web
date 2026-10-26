// #904 — when a notification may go: opt-in, quiet hours, pause, the daily cap, batching, staleness.
import { describe, it, expect } from 'vitest'
import {
  DAILY_CAP,
  DEFAULT_PREFS,
  followMessage,
  inQuietHours,
  iosVersion,
  mayReceive,
  planFollowSend,
  platformOf,
  snippet,
  weekendMessage,
  weekendWindow,
  type Prefs,
  type QueuedPost,
} from './rules'

// 2026-10-22 is a Thursday. Pacific is UTC-7 then.
const at = (hhmm: string, day = '2026-10-22') => new Date(`${day}T${hhmm}:00-07:00`)
const ON: Prefs = { ...DEFAULT_PREFS, followPosts: true, weekend: true }
const post = (n: number, page = `Page ${n}`, queuedAt = at('12:00')): QueuedPost => ({
  postId: `p${n}`,
  pageName: page,
  pagePublicId: `abcdefghij${n}`.slice(0, 10),
  body: `Post number ${n}`,
  queuedAt,
})

describe('opt-in: nothing is on by default', () => {
  it('the defaults send nothing of either kind', () => {
    expect(mayReceive(DEFAULT_PREFS, 'follow_posts', at('12:00'))).toBe(false)
    expect(mayReceive(DEFAULT_PREFS, 'weekend', at('12:00'))).toBe(false)
  })
  it('each kind is its own choice', () => {
    expect(mayReceive({ ...DEFAULT_PREFS, weekend: true }, 'follow_posts', at('12:00'))).toBe(false)
    expect(mayReceive({ ...DEFAULT_PREFS, weekend: true }, 'weekend', at('12:00'))).toBe(true)
  })
  it('pause all stops both, keeping the choices', () => {
    expect(mayReceive({ ...ON, paused: true }, 'follow_posts', at('12:00'))).toBe(false)
    expect(mayReceive({ ...ON, paused: true }, 'weekend', at('12:00'))).toBe(false)
  })
})

describe('quiet hours, in Pacific time', () => {
  it('wraps past midnight: 21 to 8 is quiet at 22:00 and 07:59, not at 08:00 or 20:59', () => {
    expect(inQuietHours(at('22:00'), 21, 8)).toBe(true)
    expect(inQuietHours(at('07:59'), 21, 8)).toBe(true)
    expect(inQuietHours(at('08:00'), 21, 8)).toBe(false)
    expect(inQuietHours(at('20:59'), 21, 8)).toBe(false)
  })
  it('a daytime span works too', () => {
    expect(inQuietHours(at('13:00'), 12, 14)).toBe(true)
    expect(inQuietHours(at('14:00'), 12, 14)).toBe(false)
  })
  it('equal hours mean no quiet hours', () => {
    expect(inQuietHours(at('03:00'), 0, 0)).toBe(false)
  })
  it('a member in quiet hours is held, not dropped', () => {
    expect(planFollowSend(ON, [post(1, 'A', at('21:30'))], 0, null, at('22:00'))).toEqual({ hold: true, drop: [] })
  })
})

describe('the daily cap and the gap', () => {
  it(`holds once ${DAILY_CAP} went out today`, () => {
    expect(planFollowSend(ON, [post(1)], DAILY_CAP, null, at('15:00'))).toMatchObject({ hold: true })
    expect(planFollowSend(ON, [post(1)], DAILY_CAP - 1, null, at('15:00'))).toHaveProperty('send')
  })
  it('holds within an hour of the last one, sends after', () => {
    expect(planFollowSend(ON, [post(1)], 1, at('14:30'), at('15:00'))).toMatchObject({ hold: true })
    expect(planFollowSend(ON, [post(1)], 1, at('14:00'), at('15:00'))).toHaveProperty('send')
  })
  it('drops what waited more than 36 hours, and sends the rest', () => {
    const old = post(1, 'Old', at('09:00', '2026-10-20'))
    const plan = planFollowSend(ON, [old, post(2, 'New')], 0, null, at('12:00'))
    expect(plan).toEqual({ send: expect.objectContaining({ title: 'New' }), drop: ['p1'] })
  })
})

describe('batching', () => {
  it('one post: the Page is the title, the post the body, it opens the Page', () => {
    const m = followMessage([post(1, 'Midtown Bakery')])
    expect(m).toMatchObject({ kind: 'follow_posts', title: 'Midtown Bakery', body: 'Post number 1' })
    expect(m.url).toMatch(/^\/g\/[a-z0-9]+\?via=push-follow_posts$/)
  })
  it('several posts become one notification naming the Pages, opening the updates', () => {
    const m = followMessage([post(1, 'A'), post(2, 'B'), post(3, 'B'), post(4, 'C'), post(5, 'D')])
    expect(m.title).toBe('5 new posts from Pages you follow')
    expect(m.body).toBe('A, B and 2 more')
    expect(m.url).toBe('/explore?view=updates&via=push-follow_posts')
  })
  it('two Pages read as "A and B"', () => {
    expect(followMessage([post(1, 'A'), post(2, 'B')]).body).toBe('A and B')
  })
  it('a long post is cut to 120 characters', () => {
    expect(snippet('x '.repeat(200)).length).toBeLessThanOrEqual(120)
  })
})

describe('the weekly this-weekend', () => {
  it('says nothing when nothing is on', () => {
    expect(weekendMessage(0, 0)).toBeNull()
  })
  it('counts what is on, and how much is from followed Pages', () => {
    expect(weekendMessage(5, 2)).toMatchObject({ title: 'This weekend near you', body: '5 things on, 2 from Pages you follow.', url: '/explore?schedule=weekend&via=push-weekend' })
    expect(weekendMessage(1, 0)!.body).toBe('1 thing on.')
  })
  it('from a Thursday, the window is Friday 00:00 to Monday 00:00 Pacific', () => {
    const w = weekendWindow(at('18:00'))
    expect(w.from.toISOString()).toBe('2026-10-23T07:00:00.000Z')
    expect(w.to.toISOString()).toBe('2026-10-26T07:00:00.000Z')
  })
  it('across the clocks going back (1 Nov), Monday midnight is PST', () => {
    const w = weekendWindow(new Date('2026-10-29T18:00:00-07:00'))
    expect(w.from.toISOString()).toBe('2026-10-30T07:00:00.000Z')
    expect(w.to.toISOString()).toBe('2026-11-02T08:00:00.000Z')
  })
})

describe('the device', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  it('names the platform', () => {
    expect(platformOf(IPHONE)).toBe('ios')
    expect(platformOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129')).toBe('android')
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/129')).toBe('desktop')
  })
  it('reads the iOS version, so 16.3 gets told it is too old', () => {
    expect(iosVersion(IPHONE)).toBeCloseTo(17.05)
    expect(iosVersion(IPHONE.replace('17_5', '16_3'))! < 16.04).toBe(true)
    expect(iosVersion('Mozilla/5.0 (Linux; Android 14)')).toBeNull()
  })
})
