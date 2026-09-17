// Who the operator is.
//
// One env var, checked server-side. Recorded as the v1 shortcut it is: there is
// no roles table, and issue #12 says so explicitly. Delegated reviewers are a
// separate change and a scenario amendment — F058 says "the operator", singular
// and definite, throughout.
//
// `ADMIN_EMAILS` sits unread in .env.local.example. It is vendor-era residue,
// not a precedent, and nothing here reads it.
//
// UNSET MEANS NOBODY. A missing or blank OPERATOR_MEMBER_ID authorises no one
// rather than everyone — the failure mode of the alternative is the whole
// moderation surface open to the internet, so it fails closed and says so.

type EnvLike = Record<string, string | undefined>

export function operatorMemberId(env: EnvLike = process.env): string | null {
  const raw = env.OPERATOR_MEMBER_ID
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export function isOperator(
  memberId: string | null | undefined,
  env: EnvLike = process.env,
): boolean {
  const operator = operatorMemberId(env)
  if (operator === null) return false
  if (!memberId || memberId === 'self-bootstrap') return false
  return memberId === operator
}
