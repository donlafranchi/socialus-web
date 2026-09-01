import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const nextParam = url.searchParams.get('next')
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/'

  const fail = (message: string) =>
    NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(message)}`, url.origin),
    )

  // Supabase appends error_description when a link is expired or already used.
  const linkError = url.searchParams.get('error_description') ?? url.searchParams.get('error')
  if (linkError) return fail(linkError)

  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return fail(error.message)
  } else if (tokenHash) {
    // Non-PKCE magic links land here (opened where no code verifier is stored).
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    if (error) return fail(error.message)
  } else {
    return fail('That sign-in link is missing its token. Request a new one.')
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
