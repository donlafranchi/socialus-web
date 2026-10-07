// #260 — an .ics of something with a start time, built from what the page
// already shows (RFC 5545: CRLF lines, UTC times, reserved characters escaped).

export interface CalendarEvent {
  uid: string
  title: string
  start: string
  /** Left out when there is none; an end is never invented. */
  end?: string | null
  location?: string | null
  url?: string | null
  now?: Date
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function buildIcs(e: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SocialUs//EN',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    // bug #340 — from the event, not the clock: the server and the browser both
    // build this link and must agree.
    `DTSTAMP:${utc(e.now ?? new Date(e.start))}`,
    `DTSTART:${utc(new Date(e.start))}`,
    ...(e.end ? [`DTEND:${utc(new Date(e.end))}`] : []),
    `SUMMARY:${text(e.title)}`,
    ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}

/** #260 — a card image's alt: the card's title, date and place, as shown. */
export function cardImageAlt(c: { title: string; when?: string | null; place?: string | null }): string {
  return [c.title, c.when, c.place].filter((s) => s && s.trim()).join(', ')
}
