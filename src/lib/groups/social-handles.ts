// Social links as HANDLES, not URLs.
//
// THE BUG THIS FIXES. Don added an Instagram account and the save failed. He
// suspected a bogus handle and no validation; it was the opposite. The field
// demanded a full `https://` URL and refused everything else, so a real handle
// was rejected for not being a URL. Reproduced exactly:
//
//   donlafranchi                        → refused
//   @donlafranchi                       → refused
//   instagram.com/donlafranchi          → refused
//   http://instagram.com/donlafranchi   → refused
//   https://instagram.com/donlafranchi  → accepted
//
// and the error read "these links are not https URLs and were refused:
// instagram" — true, unhelpful, and about our model rather than his input.
//
// WHAT IS STORED. The composed https URL, not the handle. Two reasons: the
// column's CHECK constraint already requires an https URL and every read path
// (`socialLinksForDisplay`, the public Page's href) expects one, so storing
// handles would mean a migration plus a rewrite of both. And a stored URL keeps
// working if a platform's handle rules change under us. The handle is what the
// member TYPES and what the field shows back; the URL is what we keep.
//
// VALIDATION IS PERMISSIVE ON PURPOSE. We are not verifying the account exists,
// and a regex stricter than the platform's rejects real people. Each pattern
// below is at least as permissive as the platform documents. When in doubt the
// rule is: accept it. A handle that 404s on TikTok is the member's to notice;
// a handle we refused is our bug and they cannot work around it.

import { SOCIAL_PLATFORMS, type SocialPlatform, type SocialLinks } from './social-links'

export interface PlatformField {
  /** Shown before the input, so the member types only their own part. */
  prefix: string
  /** What a handle may contain here. Permissive by design. */
  pattern: RegExp
  /** Shown when the pattern refuses. Says what IS allowed, not what is not. */
  hint: string
  /** Builds the stored URL from a cleaned handle. */
  toUrl: (handle: string) => string
  /** Recovers the handle from a stored URL, for showing it back. */
  fromUrl: (url: string) => string | null
}

/** A generic host+path pattern for the platforms that take a plain handle. */
function simple(host: string, prefixPath = '', extra = ''): PlatformField {
  const base = `https://${host}/${prefixPath}`
  return {
    prefix: `${host}/${prefixPath}`,
    // Letters, digits, dot, underscore, hyphen — the union of what these
    // platforms allow, deliberately wider than any one of them.
    pattern: /^[A-Za-z0-9._-]{1,60}$/,
    hint: `Letters, numbers, dots, underscores and hyphens${extra}`,
    toUrl: (h) => `${base}${h}`,
    fromUrl: (url) => {
      const m = new RegExp(`^https://(?:www\\.)?${host.replace('.', '\\.')}/${prefixPath}([^/?#]+)`).exec(url)
      return m ? m[1] : null
    },
  }
}

export const PLATFORM_FIELDS: Record<SocialPlatform, PlatformField> = {
  instagram: simple('instagram.com'),
  facebook: simple('facebook.com'),
  // TikTok handles are shown with a leading @ and the URL carries it.
  tiktok: simple('tiktok.com', '@'),
  x: simple('x.com'),
  youtube: simple('youtube.com', '@'),
  // Bluesky handles are domains: dots are normal and required.
  bluesky: simple('bsky.app', 'profile/', ' — a Bluesky handle looks like a domain'),
  // The one field that is genuinely a URL, because a shop or a newsletter has
  // no handle to type.
  website: {
    prefix: 'https://',
    pattern: /^[^\s/?#]+\.[^\s]{2,}$/,
    hint: 'A web address, like oakparkbakery.com',
    toUrl: (h) => `https://${h.replace(/^https?:\/\//, '')}`,
    fromUrl: (url) => url.replace(/^https:\/\//, '') || null,
  },
}

/**
 * Clean what the member typed before judging it.
 *
 * A leading @, a pasted full URL, a trailing slash and surrounding whitespace
 * are all things people really type. Rejecting any of them would be refusing a
 * real handle over punctuation.
 */
export function cleanHandle(platform: SocialPlatform, raw: string): string {
  let v = raw.trim()
  if (v === '') return ''
  // A pasted URL: take the last meaningful path segment.
  if (/^https?:\/\//i.test(v) || /^[a-z0-9-]+\.[a-z]{2,}\//i.test(v)) {
    const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`
    try {
      const u = new URL(withProto)
      if (platform === 'website') return u.hostname + (u.pathname === '/' ? '' : u.pathname)
      const parts = u.pathname.split('/').filter(Boolean)
      v = parts[parts.length - 1] ?? ''
    } catch {
      /* fall through and treat it as typed */
    }
  }
  v = v.replace(/^@/, '').replace(/\/+$/, '')
  return v
}

export interface HandleCheck {
  ok: boolean
  /** The https URL to store. Empty when the handle is empty (a removal). */
  url: string
  /** Why it was refused, in the member's terms. */
  problem: string | null
}

export function checkHandle(platform: SocialPlatform, raw: string): HandleCheck {
  const field = PLATFORM_FIELDS[platform]
  const handle = cleanHandle(platform, raw)
  if (handle === '') return { ok: true, url: '', problem: null }
  if (!field.pattern.test(handle)) {
    return { ok: false, url: '', problem: field.hint }
  }
  return { ok: true, url: field.toUrl(handle), problem: null }
}

/** Stored URLs → handles, for showing a member what they typed. */
export function handlesFromLinks(links: SocialLinks): Partial<Record<SocialPlatform, string>> {
  const out: Partial<Record<SocialPlatform, string>> = {}
  for (const p of SOCIAL_PLATFORMS) {
    const url = links[p]
    if (!url) continue
    const handle = PLATFORM_FIELDS[p].fromUrl(url)
    // A URL we cannot decompose is still shown — as itself, so nothing the
    // member saved ever disappears from the form.
    out[p] = handle ?? url
  }
  return out
}

/** Handles → the `{platform: url}` map the handler and column expect. */
export function linksFromHandles(
  handles: Partial<Record<SocialPlatform, string>>,
): { links: SocialLinks; problems: Partial<Record<SocialPlatform, string>> } {
  const links: SocialLinks = {}
  const problems: Partial<Record<SocialPlatform, string>> = {}
  for (const p of SOCIAL_PLATFORMS) {
    const raw = handles[p]
    if (raw === undefined) continue
    const res = checkHandle(p, raw)
    if (!res.ok) {
      problems[p] = res.problem ?? 'That does not look right'
      continue
    }
    if (res.url !== '') links[p] = res.url
  }
  return { links, problems }
}
