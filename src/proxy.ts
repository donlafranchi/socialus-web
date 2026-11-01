import { createServerClient } from '@supabase/ssr'
import { authCookieOptions } from '@/lib/auth/cookie-options'
import { NextResponse, type NextRequest } from 'next/server'
import { needsPhoneVerification } from '@/lib/auth/phone'
import { NAMED_COOKIE, NAMED_COOKIE_MAX_AGE, needsLegalNameCheck } from '@/lib/auth/legal-name'
import { resolveSeedCookie, SEED_COOKIE } from '@/lib/browse/session-shuffle'
import { nextVisitCookie, VISIT_COOKIE, VISIT_COOKIE_MAX_AGE } from '@/lib/browse/visits'

/** The shapes Supabase uses for "this session cookie is no longer good". */
function isStaleSession(message: string): boolean {
  return /invalid refresh token|refresh token not found|session( |_)?(not found|expired)|jwt expired/i.test(
    message,
  )
}

export async function proxy(request: NextRequest) {
  // #405 — a sign-in code that landed anywhere but the callback (Supabase falls
  // back to the Site URL when a redirect is not on its allowlist) is sent on to
  // the callback, which is the only place it is exchanged.
  const code = request.nextUrl.searchParams.get('code')
  if (code && request.method === 'GET') {
    const callback = new URL('/auth/callback', request.url)
    callback.searchParams.set('code', code)
    const next = new URL(request.nextUrl)
    next.searchParams.delete('code')
    callback.searchParams.set('next', next.pathname + next.search)
    return NextResponse.redirect(callback)
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions(request.nextUrl.protocol === 'https:' || process.env.VERCEL === '1'),
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // #405 — Supabase's pattern: the response is rebuilt from the updated
        // request, so the page rendering now sees the refreshed session. Built
        // before, it saw the spent refresh token and spent it again, which
        // revokes the session. And a stale session never takes the PKCE code
        // verifier with it: a sign-in started in this browser still needs it.
        setAll(cookiesToSet) {
          const kept = cookiesToSet.filter(({ name, value }) => value || !name.endsWith('-code-verifier'))
          kept.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          kept.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // A stale session cookie must not take the request down. This runs on every
  // matched route, so one expired refresh token turned into a 500 on every
  // page that browser asked for — twice in production on 2026-09-16 — with no
  // member-reachable way out. Signed out is a state the app already handles;
  // a token that will not refresh means signed out, not unserviceable.
  //
  // Supabase reports this both ways depending on where it fails: a rejected
  // promise, or a resolved one carrying `error`. Both are handled.
  //
  // #791 — the session is read from the token's verified claims (Supabase's
  // recommended check, against the project's ES256 key): this refreshes the
  // cookie as getUser() did, without a round trip to the auth server on every
  // request. Only the phone gate, when on, needs the full user record.
  let user: (NonNullable<Parameters<typeof needsPhoneVerification>[0]['user']> & { id: string }) | null = null
  try {
    const { data, error } = await supabase.auth.getClaims()
    const claims = data?.claims
    user = claims?.sub ? { id: claims.sub, app_metadata: claims.app_metadata ?? {} } : null
    if (user && process.env.PHONE_VERIFICATION_REQUIRED === '1') {
      user = (await supabase.auth.getUser()).data?.user ?? null
    }
    if (error && !isStaleSession(error.message)) {
      console.warn('[proxy] getClaims returned an error:', error.message)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!isStaleSession(message)) {
      // Not a stale cookie. Still not worth a 500 on a page that renders fine
      // signed out — but it is worth saying, because a failure nothing reports
      // is how a four-month outage happens.
      console.warn('[proxy] getClaims failed unexpectedly:', message)
    }
  }

  // F081 — a signed-in member verifies a phone before anything else.
  if (
    needsPhoneVerification({
      user,
      pathname: request.nextUrl.pathname,
      method: request.method,
      env: process.env,
    })
  ) {
    const redirect = NextResponse.redirect(new URL('/onboarding', request.url))
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  // F077.1 — a signed-in member with no legal name is sent to give one, before
  // any other page, whatever the phone flag says. A failed lookup never locks a
  // member out.
  if (
    needsLegalNameCheck({
      user,
      pathname: request.nextUrl.pathname,
      method: request.method,
      namedCookie: request.cookies.get(NAMED_COOKIE)?.value,
    })
  ) {
    try {
      const { data, error } = await supabase.from('members').select('legal_name').eq('id', user!.id).maybeSingle()
      if (!error && data) {
        if (!(data as { legal_name: string | null }).legal_name?.trim()) {
          const redirect = NextResponse.redirect(new URL('/onboarding', request.url))
          response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
          return redirect
        }
        response.cookies.set(NAMED_COOKIE, user!.id, { path: '/', sameSite: 'lax', httpOnly: true, maxAge: NAMED_COOKIE_MAX_AGE })
      }
    } catch (err) {
      console.warn('[proxy] legal-name lookup failed:', err instanceof Error ? err.message : String(err))
    }
  }

  // The front door is for people who aren't members yet; a member goes straight to Explore.
  if (user && request.nextUrl.pathname === '/') {
    const redirect = NextResponse.redirect(new URL('/explore', request.url))
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  // #557 — the session seed behind Explore's order. A session cookie (no max-age):
  // it dies with the browser session, holds no personal data, and is re-minted when
  // signed-in state flips, so each sign-in leads with different content.
  if (request.method === 'GET') {
    const seed = resolveSeedCookie(request.cookies.get(SEED_COOKIE)?.value, Boolean(user))
    if (seed.minted) {
      // Rebuilt from the updated request so this render reads the new seed too.
      const carried = response.cookies.getAll()
      // #796 — a new seed is a new visit: the one before becomes "last", for Explore's first look.
      const visit = nextVisitCookie(request.cookies.get(VISIT_COOKIE)?.value, new Date())
      request.cookies.set(SEED_COOKIE, seed.value)
      request.cookies.set(VISIT_COOKIE, visit)
      response = NextResponse.next({ request })
      carried.forEach((c) => response.cookies.set(c))
      response.cookies.set(SEED_COOKIE, seed.value, { path: '/', sameSite: 'lax', httpOnly: true })
      response.cookies.set(VISIT_COOKIE, visit, { path: '/', sameSite: 'lax', httpOnly: true, maxAge: VISIT_COOKIE_MAX_AGE })
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|push-sw.js|offline.html|icons/|apple-icon|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
