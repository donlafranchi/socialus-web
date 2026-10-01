// #260 — downloads an .ics of something with a start time.
import { buildIcs, type CalendarEvent } from '@/lib/calendar/ics'
import { COPY } from '@/lib/copy'

const fileName = (title: string) =>
  (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event') + '.ics'

export function AddToCalendarLink(props: Omit<CalendarEvent, 'now'>) {
  return (
    <a
      href={`data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(props))}`}
      download={fileName(props.title)}
      data-testid="add-to-calendar"
      className="text-sm text-[var(--color-accent)] hover:underline"
    >
      {COPY.addToCalendar}
    </a>
  )
}
