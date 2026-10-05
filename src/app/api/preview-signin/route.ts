// #400 — GET /api/preview-signin?token=…&next=/path, on previews only. A match
// signs in PREVIEW_PASS_EMAIL and redirects to `next`; anything else is the same
// plain 404, so the route says nothing about whether it exists or what failed.
// The limits are in src/lib/auth/preview-pass.ts.

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { safeNext } from '@/lib/safe-next'
import { fingerprint, passEnabled, tokenMatches } from '@/lib/auth/preview-pass'
import { previewPassTokenHash, sealPreviewPassSession } from '@/actions/_lib/preview-pass-link'

export const dynamic = 'force-dynamic'

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: NextRequest) {
  const env = process.env
  if (!passEnabled(env) || !tokenMatches(request.nextUrl.searchParams.get('token'), env)) return notFound()

  const tokenHash = await previewPassTokenHash(env)
  if (!tokenHash) return notFound()

  const target = new URL(safeNext(request.nextUrl.searchParams.get('next')), request.nextUrl.origin)
  const response = NextResponse.redirect(target)
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  })
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (error || !data.session) return notFound()
  // 30 days and this token's tag, in Supabase; older tokens' sessions end here.
  if (!(await sealPreviewPassSession(data.session.access_token, fingerprint(env)))) return notFound()
  response.headers.set('Cache-Control', 'no-store')
  // The token is in this URL; never send it on as a Referer.
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
