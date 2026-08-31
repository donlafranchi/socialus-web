// Signup admission policy — evaluated by the Supabase `before-user-created`
// hook before an auth.users row is written.
//
// Policy is env-driven so it can be tightened or relaxed without a deploy of
// new code:
//   SIGNUP_BLOCKED_EMAIL_DOMAINS  extra domains to refuse, comma-separated
//   SIGNUP_ALLOWED_EMAIL_DOMAINS  if non-empty, ONLY these domains may sign up
//
// Both are optional. With neither set, the built-in disposable-domain list is
// the whole policy.
//
// Deliberately NOT here: rate limiting, IP/region blocks, reputation scoring.
// Those need state; this module stays a pure function of (payload, env).

/** A small, high-confidence set. Not exhaustive — throwaway domains churn fast. */
const DISPOSABLE_DOMAINS = new Set([
  '0-mail.com',
  '10minutemail.com',
  'discard.email',
  'dispostable.com',
  'fakeinbox.com',
  'getnada.com',
  'guerrillamail.com',
  'mailinator.com',
  'maildrop.cc',
  'mailnesia.com',
  'sharklasers.com',
  'temp-mail.org',
  'tempmail.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
])

export interface BeforeUserCreatedUser {
  email?: string | null
  phone?: string | null
  is_anonymous?: boolean
}

export interface PolicyEnv {
  SIGNUP_BLOCKED_EMAIL_DOMAINS?: string
  SIGNUP_ALLOWED_EMAIL_DOMAINS?: string
}

export type PolicyDecision =
  | { allow: true }
  | { allow: false; httpCode: number; message: string; reason: string }

function parseDomainList(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  )
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return null
  return email.slice(at + 1).toLowerCase()
}

export function evaluateSignupPolicy(
  user: BeforeUserCreatedUser,
  env: PolicyEnv = process.env as PolicyEnv,
): PolicyDecision {
  // Phone-only and anonymous signups carry no email to judge. Allow — the
  // email-domain policy simply does not apply to them.
  const email = (user.email ?? '').trim().toLowerCase()
  if (!email) return { allow: true }

  const domain = emailDomain(email)
  if (!domain) {
    return {
      allow: false,
      httpCode: 400,
      reason: 'malformed_email',
      message: 'That email address does not look valid. Please check it and try again.',
    }
  }

  const allowed = parseDomainList(env.SIGNUP_ALLOWED_EMAIL_DOMAINS)
  if (allowed.size > 0 && !allowed.has(domain)) {
    return {
      allow: false,
      httpCode: 403,
      reason: 'domain_not_allowed',
      message: 'Sign-ups are currently limited to approved email domains.',
    }
  }

  const blocked = parseDomainList(env.SIGNUP_BLOCKED_EMAIL_DOMAINS)
  if (DISPOSABLE_DOMAINS.has(domain) || blocked.has(domain)) {
    return {
      allow: false,
      httpCode: 403,
      reason: 'disposable_email',
      message:
        'Please sign up with a permanent email address — temporary inboxes are not accepted.',
    }
  }

  return { allow: true }
}
