// What time "seven o'clock" is.
//
// F072 criterion 3: "Times are the metro's, never the reader's and never the
// server's." That is a harder requirement than it sounds, because
// `timestamptz` normalises to UTC and discards the offset it was written with
// — nothing in the row remembers that seven o'clock meant seven in Sacramento.
// Rendering with the reader's browser zone shows a Sacramento evening as a New
// York night, and rendering with the server's shows it as UTC.
//
// THE ZONE IS A CONSTANT, AND THAT IS TEMPORARY. socialus-web #173 gives the
// metro its own timezone column; it is open and unblocked. With one metro live
// a constant is defensible, and this is the one place it exists — so #173
// changes this file and nothing else. It is deliberately not a literal
// scattered through the composer.

/** Sacramento. Replaced by the metro's own column when #173 lands. */
export const METRO_TIME_ZONE = 'America/Los_Angeles'

/**
 * The offset, in milliseconds, of `tz` from UTC at a given instant.
 *
 * Formatted into the zone and read back as if it were UTC; the difference is
 * the offset. There is no API that gives this directly.
 */
function offsetAt(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  // `hour: '2-digit'` with hour12:false renders midnight as 24 in some
  // engines. Left as an engine quirk to normalise rather than a format to
  // fight.
  const asIfUtc = Date.UTC(at('year'), at('month') - 1, at('day'), at('hour') % 24, at('minute'), at('second'))
  return asIfUtc - utcMs
}

/**
 * A date and a time as the creator typed them, in the metro's zone, as an
 * instant.
 *
 * TWO PASSES, because the offset depends on the answer. Guess with the offset
 * at the wall-clock reading, then re-read the offset at the instant that
 * guess produced. One pass is wrong across a DST boundary by exactly an hour,
 * which is the failure that shows up twice a year and never in a test written
 * in June.
 *
 * Returns null for anything that is not a complete date and time — a creator
 * who typed one and not the other has not given a time, and inventing the
 * missing half is how a post lands on the wrong day.
 */
export function metroWallTimeToInstant(
  date: string,
  time: string,
  tz: string = METRO_TIME_ZONE,
): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!d || !t) return null

  const hour = Number(t[1])
  const minute = Number(t[2])
  if (hour > 23 || minute > 59) return null

  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hour, minute)
  if (Number.isNaN(wall)) return null

  const firstPass = wall - offsetAt(wall, tz)
  const instant = wall - offsetAt(firstPass, tz)
  return new Date(instant).toISOString()
}

/**
 * An instant, read back in the metro's zone, in the words a creator would use.
 *
 * Fixed locale and fixed zone: the server render and the browser must produce
 * the same string or React reports a hydration mismatch on every Page that has
 * a dated announcement. That is the same reason `formatPostDate` pins UTC.
 */
export function formatMetroDateTime(
  iso: string,
  tz: string = METRO_TIME_ZONE,
  now: Date = new Date(),
  /** #262 — an end on the same day reads as a range: "at 7:00–9:00pm". */
  endIso?: string | null,
): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear =
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(d) ===
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(now)
  const day = d.toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  const clock = d
    .toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
    // "7:00 PM" reads better as "7:00pm" beside a date, and the voice guide
    // has no place for shouting.
    .replace(' AM', 'am')
    .replace(' PM', 'pm')
  if (endIso && sameMetroDay(iso, endIso, tz)) {
    const end = longClock(new Date(endIso), tz)
    return `${day} at ${joinRange(clock, end)}`
  }
  return `${day} at ${clock}`
}

function longClock(d: Date, tz: string): string {
  return d
    .toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
    .replace(' AM', 'am')
    .replace(' PM', 'pm')
}

function sameMetroDay(a: string, b: string, tz: string): boolean {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return day.format(new Date(a)) === day.format(new Date(b))
}

/** "7pm" + "9pm" → "7–9pm"; "11:30am" + "1pm" → "11:30am–1pm". */
function joinRange(start: string, end: string): string {
  const meridiem = (c: string) => c.slice(-2)
  return meridiem(start) === meridiem(end) ? `${start.slice(0, -2)}–${end}` : `${start}–${end}`
}

function isThisYear(d: Date, tz: string, now: Date): boolean {
  const year = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' })
  return year.format(d) === year.format(now)
}

/** #256 (F072 criterion 3) — a card's lead: "Thu Sep 10 · 7pm", in the metro.
 *  #262 — with an end: "Thu Sep 10 · 7–9pm", or both days past midnight. */
export function formatCardWhen(
  iso: string,
  tz: string = METRO_TIME_ZONE,
  now: Date = new Date(),
  endIso?: string | null,
): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(isThisYear(d, tz, now) ? {} : { year: 'numeric' }),
  })
  const clock = shortClock(d, tz)
  // "Thu, Sep 10" → "Thu Sep 10"; a year keeps its own comma.
  const start = `${day.replace(',', '')} · ${clock}`
  if (!endIso || Number.isNaN(new Date(endIso).getTime())) return start
  if (!sameMetroDay(iso, endIso, tz)) return `${start} – ${formatCardWhen(endIso, tz, now)}`
  return `${day.replace(',', '')} · ${joinRange(clock, shortClock(new Date(endIso), tz))}`
}

/** #256 — an undated announcement keeps the date it was posted: "Posted Sep 2". */
export function formatPostedDate(iso: string, tz: string = METRO_TIME_ZONE, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    ...(isThisYear(d, tz, now) ? {} : { year: 'numeric' }),
  })
  return `Posted ${day}`
}

function shortClock(d: Date, tz: string): string {
  return d
    .toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
    .replace(':00', '')
    .replace(' AM', 'am')
    .replace(' PM', 'pm')
}
