// Canonical origin for anything that leaves the browser — magic-link and OAuth
// redirects, OG tags, share links.
//
// Order matters. NEXT_PUBLIC_SITE_URL wins so a production build always emits
// the canonical host (www.socialus.org) rather than whatever host the visitor
// happened to type: Supabase only honours a redirectTo that matches its
// Redirect URLs allowlist, and one canonical entry is cheaper to keep correct
// than one per alias. It is deliberately left unset in .env.local, so local dev
// falls through to window.location.origin and links land on localhost.
const CANONICAL_ORIGIN = 'https://www.socialus.org'

export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`
  return CANONICAL_ORIGIN
}

/** The URL Supabase sends a member back to after they open an emailed link. */
export function authRedirectUrl(next?: string | null): string {
  const query = next ? `?next=${encodeURIComponent(next)}` : ''
  return `${siteOrigin()}/auth/callback${query}`
}
