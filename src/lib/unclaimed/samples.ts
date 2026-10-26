// #556 — sample posts for an unclaimed Page: what a Page looks like with an event, a deal and a
// last-minute opening on it, so a business and a local can see the point. EVERY one opens with
// "Sample" (Don, 2026-10-10) so nobody shows up for a deal that does not exist; the column
// `page_posts.sample_kind` marks them for the refresh and for removal once a real post exists.
import { createHash } from 'node:crypto'
import { METRO_TIME_ZONE, metroWallTimeToInstant } from '../metro/metro-time'
import { metroDate, metroWeekday, shiftDays } from '../metro/metro-week'

export type SampleKind = 'event' | 'deal' | 'last_minute'
export const SAMPLE_LABEL = 'Sample'

export interface SamplePost {
  kind: SampleKind
  body: string
  howToFind: string
  startsAt: Date
  endsAt: Date
}

export interface SampleSubject {
  name: string
  slug: string
  pool: string
  area: string
}

type Voice = 'food' | 'makers' | 'trades' | 'farm' | 'stay' | 'community' | 'local'
const VOICE: Record<string, Voice> = {
  'Food & drink': 'food',
  'Cakes & bakery': 'food',
  'Goods & crafts': 'makers',
  'Art & print': 'makers',
  'Repair & trades': 'trades',
  Farm: 'farm',
  Ranch: 'farm',
  'Farm stay & agritourism': 'stay',
  'Community & volunteer': 'community',
  'Arts & culture': 'community',
  'Green & outdoors': 'community',
}

// Two wordings per kind per voice; the Page's slug picks one, so neighbours do not read the same.
const COPY: Record<Voice, Record<SampleKind, [string, string]>> = {
  food: {
    event: ['Tasting at {name}: free samples, the new seasonal lineup, and a chance to meet the people who make it. Drop in any time.', 'Meet the maker night at {name}: a small tasting, a look behind the counter, and a thank-you for locals who come by.'],
    deal: ['This week only at {name}: 15% off your first order when you mention SocialUs.', 'Neighbour deal at {name}: buy two, get a third at half price this week.'],
    last_minute: ['Open spots tomorrow morning at {name}: a few seats left for our small-group tasting. Walk-ins welcome while they last.', 'Fresh batch just out at {name}. First 20 people through the door tomorrow get one on the house.'],
  },
  makers: {
    event: ['Open studio at {name}: watch the work happen, ask questions, and take something home. Everyone is welcome.', 'Maker pop-up with {name}: new pieces, a hands-on demo, and a local-only first look.'],
    deal: ['Local week at {name}: 20% off anything made this month, for people in the area.', 'Bundle deal at {name}: pick any three small pieces and pay for two.'],
    last_minute: ['Last-minute opening at {name}: a few spots in tomorrow’s workshop just freed up. Come as you are, we supply the rest.', 'Just finished at {name}: a small run of one-offs, available tomorrow only.'],
  },
  trades: {
    event: ['Free fix-it clinic at {name}: bring something small that is broken and we will show you how to mend it.', 'Open shop day at {name}: see how we work, ask us anything, and get a free once-over on one item.'],
    deal: ['Local rate at {name} this month: 10% off your first repair for people nearby.', 'Tune-up special at {name}: a flat price through the end of the week.'],
    last_minute: ['Same-day slots open at {name} tomorrow: a couple of cancellations, so a quick job can be done while you wait.', 'We have a gap in the schedule at {name} today and tomorrow. Message ahead and we will fit you in.'],
  },
  farm: {
    event: ['Farm open day at {name}: walk the fields, taste what is in season, and meet the people who grow it.', 'Harvest morning at {name}: pick your own and take it home. Families welcome, boots recommended.'],
    deal: ['Fresh this week at {name}: a box of what is in season, priced for neighbours who pick it up.', 'Buy a half-share at {name} this week and get a second box at half price.'],
    last_minute: ['Just picked at {name}: a small extra harvest, available tomorrow morning while it lasts.', 'Late cancellation at {name}: two spots open for tomorrow’s farm walk. First come, first served.'],
  },
  stay: {
    event: ['Open day at {name}: tour the property, meet the animals, and see the rooms. Free for neighbours.', 'Harvest dinner at {name}: a long table, food from the land, and a few seats for locals.'],
    deal: ['Locals’ night at {name}: 15% off a midweek stay, for people who live within an hour.', 'Stay deal at {name}: stay two nights, get a farm breakfast on us.'],
    last_minute: ['Last-minute opening at {name}: a cancellation freed up a room. Book it before it goes.', 'Tonight only at {name}: one night’s stay at a reduced rate. Message us today.'],
  },
  community: {
    event: ['Volunteer morning with {name}: a couple of hours, no experience needed, and a chance to meet neighbours who pitch in.', 'Open house at {name}: see what we do, meet the people behind it, and find out where a spare hour helps most.'],
    deal: ['How to help {name} this week: drop off what is on our list, or bring a friend to a shift. Every bit goes straight to neighbours.', 'This week at {name}: a short list of what we need most, and a few easy ways to lend a hand.'],
    last_minute: ['A few volunteer spots just opened at {name} for tomorrow. Come as you are; we will show you what to do.', 'Extra hands needed at {name} tomorrow morning. An hour helps, and newcomers are welcome.'],
  },
  local: {
    event: ['Neighbourhood open house at {name}: come see what we do, meet the owners, and enjoy something local.', 'Meet your neighbours at {name}: a casual afternoon, light refreshments, and a look at what is new.'],
    deal: ['Local-only offer at {name}: 10% off for anyone in the area through the end of the week.', 'Bring a neighbour to {name} this week and you both get a little something extra.'],
    last_minute: ['Something new at {name} tomorrow only: drop in between ten and two and be the first to see it.', 'A few last-minute spots open at {name} tomorrow. Message ahead or just walk in.'],
  },
}

const pick = (slug: string, i: number) => parseInt(createHash('sha1').update(`${slug}:${i}`).digest('hex').slice(0, 6), 16) % 2

type Window = { startsAt: Date; endsAt: Date }
const hash = (key: string) => parseInt(createHash('sha1').update(key).digest('hex').slice(0, 8), 16)
const KINDS = ['event', 'deal', 'last_minute'] as const
// Mon–Thu once each, Fri twice, Sat three times, Sun twice: every day gets Pages, the weekend gets more.
const WEEKDAYS = [1, 2, 3, 4, 5, 5, 6, 6, 6, 0, 0]
// Start hour by voice and kind; the Page's slug adds 0 or 1 hour.
const HOUR: Record<Voice, Record<SampleKind, number>> = {
  food: { event: 17, deal: 11, last_minute: 9 },
  makers: { event: 11, deal: 10, last_minute: 13 },
  trades: { event: 10, deal: 9, last_minute: 8 },
  farm: { event: 9, deal: 8, last_minute: 10 },
  stay: { event: 16, deal: 15, last_minute: 15 },
  community: { event: 9, deal: 10, last_minute: 8 },
  local: { event: 17, deal: 10, last_minute: 10 },
}
const pad = (n: number) => `${String(n).padStart(2, '0')}:00`
const wall = (ymd: string, hhmm: string) => new Date(metroWallTimeToInstant(ymd, hhmm, METRO_TIME_ZONE)!)
const startHour = (kind: SampleKind, slug: string, pool: string) => HOUR[VOICE[pool] ?? 'local'][kind] + (hash(`${slug}:${kind}`) % 2)
const span = (kind: SampleKind, ymd: string, hour: number, slug: string): Window =>
  kind === 'deal'
    ? { startsAt: wall(ymd, pad(hour)), endsAt: wall(shiftDays(ymd, 1 + (hash(`${slug}:span`) % 2)), '21:00') }
    : { startsAt: wall(ymd, pad(hour)), endsAt: wall(ymd, pad(hour + (kind === 'event' ? 3 : 4))) }

/**
 * Don, 2026-10-16 (cap-1, cap-5; replaces #816 a1's 14-day spread): each Page posts on one weekday, chosen by its slug,
 * in weeks 1, 2 and 3 from now — a regular weekly look. The order of the kinds and the hour vary by Page; a deal runs
 * 2–3 days. Days and hours are the metro's own.
 */
export function sampleSchedule(now: Date, slug: string, pool: string): Record<SampleKind, Window> {
  const h = hash(slug)
  const weekday = WEEKDAYS[h % WEEKDAYS.length]!
  const ahead = ((weekday - metroWeekday(now, METRO_TIME_ZONE) + 7) % 7) || 7
  const first = shiftDays(metroDate(now, METRO_TIME_ZONE), ahead)
  const order = [...KINDS].sort((a, b) => hash(`${slug}:${a}:order`) - hash(`${slug}:${b}:order`))
  return Object.fromEntries(order.map((kind, week) => [kind, span(kind, shiftDays(first, week * 7), startHour(kind, slug, pool), slug)])) as Record<SampleKind, Window>
}

/** True when a sample sits on the Page's weekday at its hour, so the refresh leaves it alone. */
export function fitsSchedule(kind: SampleKind, w: Window, slug: string, pool: string): boolean {
  const ymd = metroDate(w.startsAt, METRO_TIME_ZONE)
  return metroWeekday(w.startsAt, METRO_TIME_ZONE) === WEEKDAYS[hash(slug) % WEEKDAYS.length] && span(kind, ymd, startHour(kind, slug, pool), slug).startsAt.getTime() === w.startsAt.getTime()
}

/** A finished sample moves on in three-week steps, same weekday and wall time, until it is ahead again; null when it isn't finished. */
export function rollSample(w: Window, now: Date): Window | null {
  if (w.endsAt > now) return null
  const hm = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: METRO_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  let [s, e] = [metroDate(w.startsAt, METRO_TIME_ZONE), metroDate(w.endsAt, METRO_TIME_ZONE)]
  let out = w
  while (out.endsAt <= now) {
    ;[s, e] = [shiftDays(s, 21), shiftDays(e, 21)]
    out = { startsAt: wall(s, hm(w.startsAt)), endsAt: wall(e, hm(w.endsAt)) }
  }
  return out
}

export const isSampleBody = (body: string) => body.startsWith(`${SAMPLE_LABEL} ·`)

export function samplePosts(s: SampleSubject, now: Date): SamplePost[] {
  const voice = VOICE[s.pool] ?? 'local'
  const when = sampleSchedule(now, s.slug, s.pool)
  return KINDS.map((kind, i) => {
    const text = COPY[voice][kind][pick(s.slug, i)].replaceAll('{name}', s.name)
    const body = `${SAMPLE_LABEL} · ${text}\n\nThis is a sample post showing what ${s.name}'s Page could look like. It is not a real offer. Locals will find posts like this on the Page and in Explore, and can follow the Page to see them first.`
    const how = `${s.area}: look for ${s.name} on SocialUs.`.slice(0, 140)
    return { kind, body, howToFind: how, ...when[kind] }
  })
}
