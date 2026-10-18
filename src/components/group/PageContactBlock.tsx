// #293 — a Page's phone and opening hours, for signed-in visitors (the front
// door shows neither). Renders only what the owner filled in. #896 — and its
// website and social links (Yelp's and Google's info block).

import { Globe, Phone } from 'lucide-react'
import type { ContactLinks } from '@/lib/groups/social-links'
import { SocialIcon } from './SocialIcon'
import { formatUsPhone } from '@/lib/phone'
import { weekFromToday } from '@/lib/groups/opening-hours'
import type { PageContact } from '@/lib/groups/page-contact'
import { SHOW_OPENING_HOURS } from '@/lib/features'

export function PageContactBlock({
  contact,
  now = new Date(),
  showHours = SHOW_OPENING_HOURS,
  links = { website: null, socials: [] },
}: {
  contact: PageContact | null
  links?: ContactLinks
  now?: Date
  /** Off by the hours flag (Don, 2026-10-05); on only where it's turned on. */
  showHours?: boolean
}) {
  const hours = showHours ? contact?.hours ?? null : null
  const phone = contact?.phone ?? null
  const out = { target: '_blank', rel: 'noopener noreferrer' } as const
  if (!phone && !hours && !links.website && links.socials.length === 0) return null
  return (
    <section data-testid="page-contact" aria-label="Contact" className="flex flex-col items-start gap-1">
      {links.website && (
        <a href={links.website.url} {...out} data-testid="shop-social-website" className="press inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--color-charcoal-900)] underline">
          <Globe size={16} aria-hidden="true" />
          {links.website.text}
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone}`}
          data-testid="page-phone"
          className="press inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--color-charcoal-900)] underline"
        >
          <Phone size={16} aria-hidden="true" />
          {formatUsPhone(phone)}
        </a>
      )}
      {/* F070 — every URL re-checked on read; off-platform, in a new tab. */}
      {links.socials.length > 0 && (
        <ul data-testid="shop-social-links" className="-ml-3 flex flex-wrap gap-1">
          {links.socials.map((s) => (
            <li key={s.platform}>
              <a
                href={s.url}
                {...out}
                data-testid={`shop-social-${s.platform}`}
                title={s.name}
                className="press inline-flex size-tap items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100"
              >
                <SocialIcon platform={s.platform as Exclude<typeof s.platform, 'website'>} />
                <span className="sr-only">{s.name}</span>
              </a>
            </li>
          ))}
        </ul>
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
