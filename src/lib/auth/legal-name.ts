// F077.1 — a signed-in member with no legal name is sent to give one.
// `su_named` holds the member id once the name is known, so the lookup runs
// once per browser rather than on every request.

export const NAMED_COOKIE = 'su_named'
export const NAMED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

interface GateUser {
  id: string
  app_metadata?: Record<string, unknown>
}

const OPEN_PATHS = [/^\/onboarding(\/|$)/, /^\/auth(\/|$)/, /^\/api(\/|$)/]

/** True when the legal name must be looked up for this request. Builders are exempt, as for the phone gate (#280). */
export function needsLegalNameCheck({
  user,
  pathname,
  method,
  namedCookie,
}: {
  user: GateUser | null
  pathname: string
  method: string
  namedCookie: string | undefined
}): boolean {
  if (!user || method !== 'GET') return false
  if (user.app_metadata?.builder === true) return false
  if (namedCookie === user.id) return false
  return !OPEN_PATHS.some((p) => p.test(pathname))
}
