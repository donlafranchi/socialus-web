import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { needsPhoneVerification } from '@/lib/auth/phone'
import { resolveSeedCookie, SEED_COOKIE } from '@/lib/browse/session-shuffle'

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
  let user: Parameters<typeof needsPhoneVerification>[0]['user'] = null
  try {
    const { data, error } = await supabase.auth.getUser()
    user = data?.user ?? null
    if (error && !isStaleSession(error.message)) {
      console.warn('[proxy] getUser returned an error:', error.message)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!isStaleSession(message)) {
      // Not a stale cookie. Still not worth a 500 on a page that renders fine
      // signed out — but it is worth saying, because a failure nothing reports
      // is how a four-month outage happens.
      console.warn('[proxy] getUser failed unexpectedly:', message)
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

  // #557 — the session seed behind Explore's order. A session cookie (no max-age):
  // it dies with the browser session, holds no personal data, and is re-minted when
  // signed-in state flips, so each sign-in leads with different content.
  if (request.method === 'GET') {
    const seed = resolveSeedCookie(request.cookies.get(SEED_COOKIE)?.value, Boolean(user))
    if (seed.minted) {
      // Rebuilt from the updated request so this render reads the new seed too.
      const carried = response.cookies.getAll()
      request.cookies.set(SEED_COOKIE, seed.value)
      response = NextResponse.next({ request })
      carried.forEach((c) => response.cookies.set(c))
      response.cookies.set(SEED_COOKIE, seed.value, { path: '/', sameSite: 'lax', httpOnly: true })
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
