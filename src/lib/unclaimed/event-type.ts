// #1045 — what kind of event an imported show is, from its title (then its venue), so its picture and interest tags fit it.
export type EventType = 'sports' | 'music' | 'comedy' | 'family' | 'theater' | 'other'

/** #1127 — the line every imported show's body carries (showBody); the card reads it to know a post is a venue show. */
export const CALENDAR_LINE = (venue: string) => `From ${venue}'s own calendar: `

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

/** The labels a show of this type carries, from the shared list (src/lib/labels/list.ts, #1180). */
export const EVENT_INTERESTS: Record<EventType, string[]> = {
  sports: ['Fitness & outdoors', 'Team sports'],
  music: ['Live music'],
  comedy: ['Arts & culture', 'Theater & comedy'],
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
