'use client'

// #922 (Don, 2026-10-18) — a Page card's quick links, Yelp-style: Directions, Website, Instagram, TikTok when
// the Page has them, as small icons with screen-reader labels and 44px targets. Never on a post. Directions
// opens Apple Maps on iPhone and iPad, Google Maps elsewhere, and only for a Page at a fixed point.

import { useSyncExternalStore } from 'react'
import { Globe, Navigation } from 'lucide-react'
import { isAppleMobile, mapsLinks } from '@/lib/maps/links'
import type { QuickLinks as QuickLinksData } from '@/lib/feed/browse-feed'

const noop = () => () => {}
const useApple = () => useSyncExternalStore(noop, () => isAppleMobile(), () => false)

const LINK =
  'press inline-flex size-tap items-center justify-center rounded-md text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]'

export function QuickLinks({
  links,
  name,
  point,
}: {
  links: QuickLinksData
  name: string
  point: { latitude: number; longitude: number } | null
}) {
  const apple = useApple()
  // To the point itself: a place label like "Hall" is not an address a maps app can route to.
  const directions =
    links.fixedPoint && point
      ? mapsLinks({ label: `${point.latitude},${point.longitude}`, lat: point.latitude, lng: point.longitude, exact: true }, apple).directions
      : null
  const items = [
    directions && { key: 'directions', href: directions, label: `Directions to ${name}`, icon: <Navigation size={18} strokeWidth={1.75} aria-hidden /> },
    links.website && { key: 'website', href: links.website, label: `${name} website`, icon: <Globe size={18} strokeWidth={1.75} aria-hidden /> },
    links.instagram && { key: 'instagram', href: links.instagram, label: `${name} on Instagram`, icon: <InstagramGlyph /> },
    links.tiktok && { key: 'tiktok', href: links.tiktok, label: `${name} on TikTok`, icon: <TikTokGlyph /> },
  ].filter((x): x is { key: string; href: string; label: string; icon: React.ReactElement } => Boolean(x))
  if (items.length === 0) return null
  return (
    <div data-testid="quick-links" className="-ml-2 flex items-center">
      {items.map((i) => (
        <a key={i.key} href={i.href} target="_blank" rel="noopener noreferrer" data-testid={`quick-link-${i.key}`} className={LINK}>
          {i.icon}
          <span className="sr-only">{i.label}</span>
        </a>
      ))}
    </div>
  )
}

function InstagramGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TikTokGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
      <path d="M14 3c.5 2.6 2.3 4.3 5 4.5" />
    </svg>
  )
}
