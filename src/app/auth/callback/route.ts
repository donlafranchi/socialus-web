import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { safeNext } from '@/lib/safe-next'
import type { EmailOtpType } from '@supabase/supabase-js'

const OTP_TYPES: EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]

export async function GET(request: Request) {
  const url = new URL(request.url)
  const next = safeNext(url.searchParams.get('next'))

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
    // The type must come off the link: a first-time link is `signup`, a
    // returning one `magiclink`. Hardcoding either rejects the other.
    const raw = url.searchParams.get('type')
    const type = OTP_TYPES.includes(raw as EmailOtpType)
      ? (raw as EmailOtpType)
      : 'magiclink'
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) return fail(error.message)
  } else {
    return fail('That sign-in link is missing its token. Request a new one.')
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
