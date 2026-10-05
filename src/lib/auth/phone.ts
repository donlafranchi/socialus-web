// F081 — a member is verified as a person by a text-message code to their
// phone, at signup (Don, 2026-10-01). Builders are the named exception: no
// text code (#280).

export { normalizeUsPhone } from '@/lib/phone'

interface GateUser {
  phone_confirmed_at?: string | null
  app_metadata?: Record<string, unknown>
}

const OPEN_PATHS = [/^\/onboarding(\/|$)/, /^\/auth(\/|$)/, /^\/api(\/|$)/]

/** True when this request should be sent to verify a phone first. Off until
 *  PHONE_VERIFICATION_REQUIRED is set, which waits on the SMS provider. */
export function needsPhoneVerification({
  user,
  pathname,
  method,
  env,
}: {
  user: GateUser | null
  pathname: string
  method: string
  env: Record<string, string | undefined>
}): boolean {
  if (env.PHONE_VERIFICATION_REQUIRED !== '1') return false
  if (!user || method !== 'GET') return false
  if (user.app_metadata?.builder === true) return false
  if (user.phone_confirmed_at) return false
  return !OPEN_PATHS.some((p) => p.test(pathname))
}
