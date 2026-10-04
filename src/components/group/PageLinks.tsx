// #344 — a Page's links out as one row of icon buttons, each named for its
// platform, and the website as one plain link. `socialLinksForDisplay`
// re-checks every URL on read: these render straight into href. Off-platform,
// so rel="noopener noreferrer" and a new tab, and a member keeps the Page.

import { Globe } from 'lucide-react'
import { socialLinksForDisplay, type SocialLinks } from '@/lib/groups/social-links'
import { BrandIcon } from './BrandIcon'

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function PageLinks({ links }: { links: SocialLinks | null | undefined }) {
  const all = socialLinksForDisplay(links)
  if (all.length === 0) return null
  const website = all.find((l) => l.platform === 'website')
  const social = all.filter((l) => l.platform !== 'website')
  return (
    <div data-testid="shop-social-links" className="mt-1 flex flex-col">
      {website && (
        <a
          href={website.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="page-website"
          className="press inline-flex min-h-tap items-center gap-2 self-start text-body-sm font-medium text-[var(--color-accent)] underline"
        >
          <Globe size={16} aria-hidden="true" />
          {host(website.url)}
        </a>
      )}
      {social.length > 0 && (
        <div data-testid="page-social-icons" className="-ml-3 flex flex-wrap">
          {social.map((l) => (
            <a
              key={l.platform}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={l.label}
              title={l.label}
              data-testid={`shop-social-${l.platform}`}
              className="press inline-flex size-tap items-center justify-center rounded-full text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
            >
              <BrandIcon platform={l.platform as Exclude<typeof l.platform, 'website'>} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
