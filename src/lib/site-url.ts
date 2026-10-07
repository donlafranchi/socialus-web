// Canonical origin for anything that leaves the browser — OG tags, share links
// — and, separately, the origin an auth redirect must name.
//
// Order matters. NEXT_PUBLIC_SITE_URL wins so a production build always emits
// the canonical host (www.socialus.org) rather than whatever host the visitor
// happened to type: Supabase only honours a redirectTo that matches its
// Redirect URLs allowlist, and one canonical entry is cheaper to keep correct
// than one per alias. It is deliberately left unset in .env.local, so local dev
// falls through to window.location.origin and links land on localhost.
const CANONICAL_ORIGIN = 'https://www.socialus.org'

/** #444 — the root layout's metadataBase, so relative metadata URLs resolve
 *  against the canonical host (www.socialus.org in production). */
export function siteMetadataBase(): URL {
  return new URL(siteOrigin())
}

/** Canonical public origin. Use for anything published: OG tags, share links. */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return `https://${vercelHost() ?? CANONICAL_ORIGIN.replace('https://', '')}`
}

// VERCEL_PROJECT_PRODUCTION_URL is set on EVERY environment — it names the
// project's production domain, not the deployment being rendered. Consulting it
// first made a preview render resolve to production. On a production deployment
// it is still the right answer: VERCEL_URL there is the deployment hash host,
// not the custom domain.
function vercelHost(): string | undefined {
  const deployment = process.env.VERCEL_URL?.trim()
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  const preferred =
    process.env.VERCEL_ENV === 'production'
      ? production || deployment
      : deployment || production
  return preferred?.replace(/\/+$/, '') || undefined
}

// The PKCE code verifier is a HOST-ONLY cookie: `createBrowserClient` writes it
// through document.cookie with no Domain attribute, so it belongs to the exact
// origin sign-in started on and to no other. A redirect that names a different
// host arrives where no verifier exists, and the exchange fails with "PKCE code
// verifier not found in storage" — which is what a preview deployment does when
// the canonical origin is used. So this deliberately does NOT go through
// siteOrigin(): an auth redirect is not a published link, and must name the
// origin actually holding the cookie.
function authOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return siteOrigin()
}

/** The URL Supabase sends a member back to after they open an emailed link. */
export function authRedirectUrl(next?: string | null): string {
  const query = next ? `?next=${encodeURIComponent(next)}` : ''
  return `${authOrigin()}/auth/callback${query}`
}
