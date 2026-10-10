// #556 — sample posts for an unclaimed Page: what a Page looks like with an event, a deal and a
// last-minute opening on it, so a business and a local can see the point. EVERY one opens with
// "Sample" (Don, 2026-10-10) so nobody shows up for a deal that does not exist; the column
// `page_posts.sample_kind` marks them for the refresh and for removal once a real post exists.
import { createHash } from 'node:crypto'

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

type Voice = 'food' | 'makers' | 'trades' | 'farm' | 'stay' | 'local'
const VOICE: Record<string, Voice> = {
  'Food & drink': 'food',
  'Cakes & bakery': 'food',
  'Goods & crafts': 'makers',
  'Art & print': 'makers',
  'Repair & trades': 'trades',
  Farm: 'farm',
  Ranch: 'farm',
  'Farm stay & agritourism': 'stay',
}

// Two wordings per kind per voice; the Page's slug picks one, so neighbours do not read the same.
const COPY: Record<Voice, Record<SampleKind, [string, string]>> = {
  food: {
    event: ['Saturday tasting at {name}: free samples, the new seasonal lineup, and a chance to meet the people who make it. Drop in any time.', 'Meet the maker night at {name}: a small tasting, a look behind the counter, and a thank-you for locals who come by.'],
    deal: ['This week only at {name}: 15% off your first order when you mention SocialUs.', 'Neighbour deal at {name}: buy two, get a third at half price through the weekend.'],
    last_minute: ['Open spots tomorrow morning at {name}: a few seats left for our small-group tasting. Walk-ins welcome while they last.', 'Fresh batch just out at {name}. First 20 people through the door tomorrow get one on the house.'],
  },
  makers: {
    event: ['Open studio at {name} this weekend: watch the work happen, ask questions, and take something home. Everyone is welcome.', 'Maker pop-up with {name}: new pieces, a hands-on demo, and a local-only first look.'],
    deal: ['Local week at {name}: 20% off anything made this month, for people in the area.', 'Bundle deal at {name}: pick any three small pieces and pay for two.'],
    last_minute: ['Last-minute opening at {name}: a few spots in tomorrow’s workshop just freed up. Come as you are, we supply the rest.', 'Just finished at {name}: a small run of one-offs, available tomorrow only.'],
  },
  trades: {
    event: ['Free fix-it clinic at {name} on Saturday: bring something small that is broken and we will show you how to mend it.', 'Open shop day at {name}: see how we work, ask us anything, and get a free once-over on one item.'],
    deal: ['Local rate at {name} this month: 10% off your first repair for people nearby.', 'Tune-up special at {name}: a flat price through the end of the week.'],
    last_minute: ['Same-day slots open at {name} tomorrow: a couple of cancellations, so a quick job can be done while you wait.', 'We have a gap in the schedule at {name} today and tomorrow. Message ahead and we will fit you in.'],
  },
  farm: {
    event: ['Farm open day at {name} on Saturday: walk the fields, taste what is in season, and meet the people who grow it.', 'Harvest morning at {name}: pick your own and take it home. Families welcome, boots recommended.'],
    deal: ['Fresh this week at {name}: a box of what is in season, priced for neighbours who pick it up.', 'Buy a half-share at {name} this week and get a second box at half price.'],
    last_minute: ['Just picked at {name}: a small extra harvest, available tomorrow morning while it lasts.', 'Late cancellation at {name}: two spots open for tomorrow’s farm walk. First come, first served.'],
  },
  stay: {
    event: ['Open weekend at {name}: tour the property, meet the animals, and see the rooms. Free for neighbours.', 'Harvest dinner at {name} on Saturday: a long table, food from the land, and a few seats for locals.'],
    deal: ['Locals’ night at {name}: 15% off a midweek stay, for people who live within an hour.', 'Weekend deal at {name}: stay two nights, get a farm breakfast on us.'],
    last_minute: ['Last-minute opening at {name} this weekend: a cancellation freed up a room. Book it before it goes.', 'Tonight only at {name}: one night’s stay at a reduced rate. Message us today.'],
  },
  local: {
    event: ['Neighbourhood open house at {name} on Saturday: come see what we do, meet the owners, and enjoy something local.', 'Meet your neighbours at {name}: a casual afternoon, light refreshments, and a look at what is new.'],
    deal: ['Local-only offer at {name}: 10% off for anyone in the area through the end of the week.', 'Bring a neighbour to {name} this week and you both get a little something extra.'],
    last_minute: ['Something new at {name} tomorrow only: drop in between ten and two and be the first to see it.', 'A few last-minute spots open at {name} tomorrow. Message ahead or just walk in.'],
  },
}

const pick = (slug: string, i: number) => parseInt(createHash('sha1').update(`${slug}:${i}`).digest('hex').slice(0, 6), 16) % 2

const DAY = 24 * 3600_000
/** 17:00 UTC is mid-morning in California, whichever side of the clock change; the hour only has to be sensible. */
const at = (now: Date, days: number, hourUtc: number) => {
  const d = new Date(now.getTime() + days * DAY)
  d.setUTCHours(hourUtc, 0, 0, 0)
  return d
}

/** When each kind falls, counted from `now`. The refresh reuses it to roll a stale one forward. */
export function sampleWindow(kind: SampleKind, now: Date, slug: string): { startsAt: Date; endsAt: Date } {
  const shift = parseInt(createHash('sha1').update(slug).digest('hex').slice(0, 2), 16) % 4
  if (kind === 'event') return { startsAt: at(now, 3 + shift, 20), endsAt: at(now, 3 + shift, 23) }
  if (kind === 'deal') return { startsAt: at(now, 0, 0), endsAt: at(now, 6 + shift, 6) }
  return { startsAt: at(now, 1, 17), endsAt: at(now, 1, 21) }
}

export const isSampleBody = (body: string) => body.startsWith(`${SAMPLE_LABEL} ·`)

export function samplePosts(s: SampleSubject, now: Date): SamplePost[] {
  const voice = VOICE[s.pool] ?? 'local'
  return (['event', 'deal', 'last_minute'] as const).map((kind, i) => {
    const text = COPY[voice][kind][pick(s.slug, i)].replaceAll('{name}', s.name)
    const body = `${SAMPLE_LABEL} · ${text}\n\nThis is a sample post showing what ${s.name}'s Page could look like. It is not a real offer. Locals will find posts like this on the Page and in Explore, and can follow the Page to see them first.`
    const how = `${s.area}: look for ${s.name} on SocialUs.`.slice(0, 140)
    return { kind, body, howToFind: how, ...sampleWindow(kind, now, s.slug) }
  })
}
