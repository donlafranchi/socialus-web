// T151 (Issue #32) — "is this instance safe to write to?", asked explicitly.
//
// Write-bound suites create real auth users and write real objects. The gate
// they had asked whether the hostname was localhost, which is the wrong
// question twice over: it locks out a Supabase branch (a remote hostname, and
// the whole point of the branch route), and it would wave through any local
// instance regardless of what is in it.
//
// So: an explicit opt-in marker, AND a host that is local or Supabase-hosted,
// AND keys. Never inferred from the hostname alone — a project URL and a
// branch URL are the same shape, and guessing wrong points a destructive suite
// at production.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export interface WriteSafety {
  safe: boolean
  /** Which half is missing, specifically — the messages must read differently. */
  reason: string
}

function hostname(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

const isLocal = (host: string) => LOCAL_HOSTS.has(host)
const isSupabaseHosted = (host: string) => /\.supabase\.(co|in)$/.test(host)

/** The project ref is the first label of a Supabase-hosted hostname. */
const refOf = (host: string) => (isSupabaseHosted(host) ? host.split('.')[0] : null)

/**
 * Hosts this checkout must never write test data to. `NEXT_PUBLIC_SUPABASE_URL`
 * is what the app itself talks to, so a remote value there is production by
 * definition — it needs no new variable and cannot be forgotten.
 * `SUPABASE_PROTECTED_REFS` adds any others, comma-separated.
 */
function protectedRefs(env: Record<string, string | undefined>): Set<string> {
  const refs = new Set<string>()
  const appHost = hostname(env.NEXT_PUBLIC_SUPABASE_URL)
  if (appHost && !isLocal(appHost)) {
    const ref = refOf(appHost)
    if (ref) refs.add(ref)
  }
  for (const ref of (env.SUPABASE_PROTECTED_REFS ?? '').split(',')) {
    const trimmed = ref.trim()
    if (trimmed) refs.add(trimmed)
  }
  return refs
}

/**
 * The shared judgement, applied to whatever host a suite actually writes to.
 *
 * `label` names the variable in the failure message, so a developer is told
 * which one to set rather than a generic one.
 *
 * `refMatch` differs by URL shape: a Supabase project URL carries the ref as
 * its first label (`<ref>.supabase.co`), while a Postgres host carries it as
 * an inner one (`db.<ref>.supabase.co`, or a pooler host embedding it). The
 * production refusal has to catch both, so the Postgres path matches on
 * containment.
 */
function judge(
  host: string | null,
  env: Record<string, string | undefined>,
  label: string,
  refMatch: (host: string, ref: string) => boolean,
): WriteSafety {
  if (!host) {
    return { safe: false, reason: `${label} is not set, so there is no instance to check.` }
  }

  // Checked before anything else, and answerable by no variable: this is the
  // one mistake that cannot be undone.
  for (const ref of protectedRefs(env)) {
    if (refMatch(host, ref)) {
      return {
        safe: false,
        reason:
          `${host} is the production instance this checkout ships against. ` +
          'Write-bound suites are refused there unconditionally — no marker overrides this.',
      }
    }
  }

  if (!isLocal(host) && !isSupabaseHosted(host)) {
    return {
      safe: false,
      reason: `${host} is not a local or Supabase-hosted instance, so it cannot be a throwaway branch.`,
    }
  }

  if (!env.SUPABASE_TEST_EPHEMERAL) {
    return {
      safe: false,
      reason:
        `${host} carries no ephemeral marker. Set SUPABASE_TEST_EPHEMERAL=1 to assert this ` +
        'instance is a throwaway. A branch-shaped hostname is not enough on its own.',
    }
  }

  return { safe: true, reason: `${host} is marked ephemeral.` }
}

/**
 * Safety of the database a suite writes to directly, over a Postgres
 * connection string.
 *
 * Separate from `writeSafety` because they judge different instances. A suite
 * that opens a `pg` Pool on DATABASE_URL never touches SUPABASE_URL, and
 * gating it on one while it writes through the other refuses runs that are
 * perfectly safe — which is exactly what happened to the browse-source suite.
 */
export function databaseWriteSafety(
  databaseUrl: string | undefined,
  env: Record<string, string | undefined>,
): WriteSafety {
  return judge(hostname(databaseUrl), env, 'DATABASE_URL', (host, ref) =>
    host.split('.').includes(ref),
  )
}

export function writeSafety(env: Record<string, string | undefined>): WriteSafety {
  const host = hostname(env.SUPABASE_URL)
  if (!host) {
    return { safe: false, reason: 'SUPABASE_URL is not set, so there is no instance to check.' }
  }

  const ref = refOf(host)

  // Checked before anything else, and answerable by no variable: this is the
  // one mistake that cannot be undone.
  if (ref && protectedRefs(env).has(ref)) {
    return {
      safe: false,
      reason:
        `${host} is the production instance this checkout ships against. ` +
        'Write-bound suites are refused there unconditionally — no marker overrides this.',
    }
  }

  if (!isLocal(host) && !isSupabaseHosted(host)) {
    return {
      safe: false,
      reason: `${host} is not a local or Supabase-hosted instance, so it cannot be a throwaway branch.`,
    }
  }

  if (!env.SUPABASE_TEST_EPHEMERAL) {
    return {
      safe: false,
      reason:
        `${host} carries no ephemeral marker. Set SUPABASE_TEST_EPHEMERAL=1 to assert this ` +
        'instance is a throwaway. A branch-shaped hostname is not enough on its own.',
    }
  }

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY
  if (!env.SUPABASE_ANON_KEY || !serviceKey) {
    return {
      safe: false,
      reason: 'SUPABASE_ANON_KEY and a service-role key are both needed, and one is missing.',
    }
  }

  return { safe: true, reason: `${host} is marked ephemeral and has both keys.` }
}
