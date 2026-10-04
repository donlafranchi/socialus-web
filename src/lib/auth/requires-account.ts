// Signed out is read-only. Anything that touches another person needs an account.
//
// Don's ruling, 2026-09-18. The line is not about identity — he has already
// ruled that accountability here is visibility and peer pressure, not
// verification (2026-09-14). **An account buys CONTINUITY.** It is persistent,
// rate-limitable and revocable; an anonymous actor is none of those. The target
// is making repeated abuse expensive, not knowing who anyone is.
//
// So this introduces NO verification and changes NO names rule. A signed-in
// person is exactly as pseudonymous as before.
//
// WHY ONE LIST RATHER THAN A CHECK PER CONTROL. A gate re-implemented at each
// call site is a gate with a hole in it — the next control ships without one
// and nobody notices, because nothing was removed. Every interaction names
// itself here, and the prompt copy lives beside the name so a new one cannot be
// added without saying what it is for.

export const GATED_ACTIONS = [
  'follow',
  'get-updates',
  'support',
  'report',
  'respond',
  'message',
] as const

export type GatedAction = (typeof GATED_ACTIONS)[number]

interface Prompt {
  /** The heading on the sign-in prompt. Says what they were trying to do. */
  title: string
  /** Why an account, in plain words. Never "for security". */
  why: string
  /** Leads to sign-up rather than sign-in: the visitor cannot do this yet. */
  signUp?: boolean
}

// Written to be read by a stranger who has just tapped something and been
// stopped. Each says what the account is FOR, because "sign in to continue" is
// a demand and this is meant to be a reason.
const PROMPTS: Record<GatedAction, Prompt> = {
  follow: {
    // Don, 2026-10-04: signed out, nobody can follow — the button leads to sign-up.
    title: 'Sign up to follow',
    why: 'Following is kept with your account, so you can find it again and undo it.',
    signUp: true,
  },
  'get-updates': {
    title: 'Sign in to get updates',
    why: 'Updates arrive in the app, on your account — never in your inbox.',
  },
  support: {
    title: 'Sign in to support',
    why: 'Support is kept with your account, so you can take it back.',
  },
  report: {
    title: 'Sign in to report this',
    why: 'An account lets us slow down someone reporting the same business over and over. It is not an identity check.',
  },
  respond: {
    title: 'Sign in to respond',
    why: 'The organizer needs a count they can trust.',
  },
  message: {
    title: 'Sign in to send this',
    why: 'Messages are kept with your account.',
  },
}

export function promptFor(action: GatedAction): Prompt {
  return PROMPTS[action]
}

/**
 * Where to send someone so they land back where they were.
 *
 * DEFERRED REGISTRATION: the action is not lost. `next` carries the path they
 * were on, and `intent` names what they were doing, so the surface can finish
 * it once they are back rather than making them find the control again.
 */
export function signInHref(action: GatedAction, currentPath: string): string {
  const next = `${currentPath}${currentPath.includes('?') ? '&' : '?'}intent=${action}`
  return `/auth/login?next=${encodeURIComponent(next)}`
}

/** The same, through sign-up. Sign-up and sign-in are one flow; this names it. */
export function signUpHref(action: GatedAction, currentPath: string): string {
  return signInHref(action, currentPath).replace('/auth/login', '/auth/signup')
}

/** The intent carried back from sign-in, if it names a real gated action. */
export function parseIntent(raw: string | null | undefined): GatedAction | null {
  if (!raw) return null
  return (GATED_ACTIONS as readonly string[]).includes(raw) ? (raw as GatedAction) : null
}
