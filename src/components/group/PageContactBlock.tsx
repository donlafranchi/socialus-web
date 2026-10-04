// #293 — a Page's phone and opening hours, for signed-in visitors (the front
// door shows neither). Renders only what the owner filled in.
// #344 — compact: the hours collapse to one line and open inline as a native
// disclosure (no modal, no script), today first and marked.

import { ChevronDown, Phone } from 'lucide-react'
import { formatUsPhone } from '@/lib/phone'
import { hoursStatus, weekFromToday } from '@/lib/groups/opening-hours'
import type { PageContact } from '@/lib/groups/page-contact'

export function PageContactBlock({ contact, now = new Date() }: { contact: PageContact; now?: Date }) {
  if (!contact.phone && !contact.hours) return null
  const status = hoursStatus(contact.hours, now)
  return (
    <section data-testid="page-contact" aria-label="Contact" className="mt-2 flex flex-col">
      {contact.phone && (
        <a
          href={`tel:${contact.phone}`}
          data-testid="page-phone"
          className="press inline-flex min-h-tap items-center gap-2 self-start text-body-sm font-medium text-[var(--color-fg)] underline"
        >
          <Phone size={16} aria-hidden="true" />
          {formatUsPhone(contact.phone)}
        </a>
      )}
      {contact.hours && status && (
        <details data-testid="page-hours" className="group">
          <summary
            data-testid="page-hours-summary"
            className="press inline-flex min-h-tap cursor-pointer list-none items-center gap-2 text-body-sm [&::-webkit-details-marker]:hidden"
          >
            <span className={status.open ? 'font-medium text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'}>
              {status.text}
            </span>
            <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
            <span className="sr-only">, the week&rsquo;s hours</span>
          </summary>
          <dl className="mb-2 text-body-sm text-[var(--color-fg)]">
            {weekFromToday(contact.hours, now).map((d) => (
              <div
                key={d.day}
                data-testid="page-hours-day"
                aria-current={d.today ? 'date' : undefined}
                className={`flex gap-3 rounded-sm px-2 py-1 ${d.today ? 'bg-[var(--color-surface)] font-semibold' : ''}`}
              >
                <dt className="w-24 shrink-0">{d.today ? 'Today' : d.label}</dt>
                <dd className={d.text === 'Closed' ? 'text-[var(--color-fg-muted)]' : ''}>{d.text}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  )
}
