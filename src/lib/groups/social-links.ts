// A Page's links out.
//
// Mirrors the CHECK constraints on groups.social_links. Two layers on purpose:
// the database is the floor nothing gets under, and this is what lets the
// composer say why before a member submits.
//
// The dangerous case is narrow and worth naming: this map is rendered as
// `href` on a public Page, so a value that is not an https URL is an XSS
// vector wearing a platform label. https only — `javascript:`, `data:` and
// plain http are all refused.

export const SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'tiktok',
  'x',
  'youtube',
  'bluesky',
  'website',
] as const

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]
export type SocialLinks = Partial<Record<SocialPlatform, string>>

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  x: 'X',
  youtube: 'YouTube',
  bluesky: 'Bluesky',
  website: 'Website',
}

export function isSocialPlatform(key: string): key is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(key)
}

/**
 * Is this a link we are willing to put behind an href on a public page?
 *
 * Deliberately strict rather than clever: an https URL that parses, with a
 * host. No attempt to guess what someone meant by "instagram.com/clara" — the
 * composer prompts for a full address instead, because a guess that rewrites a
 * member's input is worse than a refusal that explains itself.
 */
export function isSafeLinkUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!/^https:\/\/[^\s]{1,500}$/.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' && url.hostname.length > 0
  } catch {
    return false
  }
}

export interface SocialLinksResult {
  links: SocialLinks
  /** Platform keys that were dropped, so a caller can say which and why. */
  rejected: SocialPlatform[]
}

/**
 * Normalise arbitrary input into something the column will accept.
 *
 * Empty and whitespace-only values are removals, not errors: clearing a field
 * in the composer is how a member takes a link down.
 */
export function normaliseSocialLinks(input: unknown): SocialLinksResult {
  const links: SocialLinks = {}
  const rejected: SocialPlatform[] = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { links, rejected }

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!isSocialPlatform(key)) continue
    if (typeof raw !== 'string') {
      rejected.push(key)
      continue
    }
    const value = raw.trim()
    if (value === '') continue
    if (!isSafeLinkUrl(value)) {
      rejected.push(key)
      continue
    }
    links[key] = value
  }
  return { links, rejected }
}

/** Ordered, label-carrying view for rendering. Empty when there are none. */
export function socialLinksForDisplay(
  links: SocialLinks | null | undefined,
): Array<{ platform: SocialPlatform; label: string; url: string }> {
  if (!links) return []
  return SOCIAL_PLATFORMS.flatMap((platform) => {
    const url = links[platform]
    // Guard on read too. A row written before a constraint existed, or by
    // anything that bypassed this module, must not reach an href unchecked.
    if (!url || !isSafeLinkUrl(url)) return []
    return [{ platform, label: PLATFORM_LABELS[platform], url }]
  })
}
