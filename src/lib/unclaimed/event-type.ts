// #1045 — what kind of event an imported show is, from its title (then its venue), so its picture and interest tags fit it.
export type EventType = 'sports' | 'music' | 'comedy' | 'family' | 'theater' | 'other'

const SPORTS = /\b(vs\.?|v\.)\s|\b(wwe|ufc|pbr|nba|wnba|mlb|nfl|nhl|mls|basketball|baseball|football|hockey|soccer|rodeo|wrestling|boxing|monster jam|supercross|river cats|republic fc|playoffs?|tournament)\b/i
const FAMILY = /\b(disney|paw patrol|sesame street|bluey|cocomelon|circus|kids?|children'?s?|family|storytime|puppet)\b/i
const COMEDY = /\b(comed(y|ian)|stand-?up|improv|roast)\b/i
const THEATER = /\b(ballet|opera|symphony|philharmonic|orchestra|theat(er|re)|musical|nutcracker|broadway|dance|cirque)\b/i

/** Title first (family before sports: "Disney On Ice" is not a game), then the venue's own interests. */
export function classifyEvent(title: string, venueInterests: readonly string[]): EventType {
  if (FAMILY.test(title)) return 'family'
  if (SPORTS.test(`${title} `)) return 'sports'
  if (COMEDY.test(title)) return 'comedy'
  if (THEATER.test(title)) return 'theater'
  if (venueInterests.includes('Live music')) return 'music'
  return 'other'
}

/** The interest labels a show of this type carries: the member vocabulary (src/lib/onboarding/interest-vocab.ts) plus a plain word for sports and comedy. */
export const EVENT_INTERESTS: Record<EventType, string[]> = {
  sports: ['Fitness & outdoors', 'Sports'],
  music: ['Live music'],
  comedy: ['Arts & culture', 'Comedy'],
  family: ['Kids & family'],
  theater: ['Arts & culture'],
  other: [],
}

/** The stock pool (scripts/unclaimed/stock.json) for an event type; none for other. */
export const EVENT_POOL: Record<EventType, string | null> = {
  sports: 'Event · Sports',
  music: 'Event · Concert',
  comedy: 'Event · Comedy',
  family: 'Event · Family',
  theater: 'Event · Theater',
  other: null,
}
