// Plant Foundry (Don, 2026-10-31) — a Page's website and socials as quiet icon links under its name,
// so a visitor can reach the business's own channels without scrolling to Contact. Every URL is
// already re-checked by contactLinksForDisplay.

import { Globe } from 'lucide-react'
import type { ContactLinks } from '@/lib/groups/social-links'
import { SocialIcon } from './SocialIcon'

const A = 'press inline-flex size-11 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:text-[var(--color-charcoal-900)]'

export function PageLinksRow({ links }: { links: ContactLinks }) {
  if (!links.website && links.socials.length === 0) return null
  const out = { target: '_blank', rel: 'noopener noreferrer' } as const
  return (
    <div data-testid="page-links" className="-ml-3 flex flex-wrap items-center">
      {links.website && (
        <a href={links.website.url} {...out} data-testid="page-link-website" aria-label={`Website: ${links.website.text}`} className={A}>
          <Globe size={18} aria-hidden="true" />
        </a>
      )}
      {links.socials.map((s) => (
        <a key={s.platform} href={s.url} {...out} data-testid={`page-link-${s.platform}`} aria-label={s.label} className={A}>
          <SocialIcon platform={s.platform as Exclude<typeof s.platform, 'website'>} size={18} />
        </a>
      ))}
    </div>
  )
}
