// #293 — a Page's phone and opening hours, for signed-in visitors (the front
// door shows neither). Renders only what the owner filled in.

import { Phone } from 'lucide-react'
import { formatUsPhone } from '@/lib/phone'
import { weekFromToday } from '@/lib/groups/opening-hours'
import type { PageContact } from '@/lib/groups/page-contact'
import { SHOW_OPENING_HOURS } from '@/lib/features'

export function PageContactBlock({
  contact,
  now = new Date(),
  showHours = SHOW_OPENING_HOURS,
}: {
  contact: PageContact
  now?: Date
  /** Off by the hours flag (Don, 2026-10-05); on only where it's turned on. */
  showHours?: boolean
}) {
  const hours = showHours ? contact.hours : null
  if (!contact.phone && !hours) return null
  return (
    <section data-testid="page-contact" aria-label="Contact" className="mt-2 space-y-2">
      {contact.phone && (
        <a
          href={`tel:${contact.phone}`}
          data-testid="page-phone"
          className="press inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--color-charcoal-900)] underline"
        >
          <Phone size={16} aria-hidden="true" />
          {formatUsPhone(contact.phone)}
        </a>
      )}
      {hours && (
        <dl className="text-sm text-[var(--color-fg)]">
          {weekFromToday(hours, now).map((d) => (
            <div key={d.day} data-testid="page-hours-day" className={`flex gap-3 ${d.today ? 'font-semibold' : ''}`}>
              <dt className="w-24 shrink-0">{d.today ? 'Today' : d.label}</dt>
              <dd className={d.text === 'Closed' ? 'text-[var(--color-fg-muted)]' : ''}>{d.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
