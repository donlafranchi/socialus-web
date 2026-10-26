import type { CookieOptionsWithName } from '@supabase/ssr'

// Stay signed in (the PM, 2026-10-18: at least 30 days). @supabase/ssr already writes the session
// as a persistent 400-day cookie with sameSite=lax; this adds Secure wherever the site is https.
// The session itself never times out (Supabase: time-box 0, inactivity timeout 0), and every
// visit refreshes the cookie in src/proxy.ts, so only signing out ends it.
export function authCookieOptions(secure: boolean): CookieOptionsWithName {
  return { path: '/', sameSite: 'lax', secure }
}

export const onHttps = () =>
  typeof window === 'undefined' ? process.env.VERCEL === '1' : window.location.protocol === 'https:'
