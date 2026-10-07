// Where the action layer's connection string comes from — asked as a pure
// function, so something other than a member's failed write can ask it.
//
// This is split out of `db.ts` because of a four-month outage: `DATABASE_URL`
// was never set in any deployed environment, and the only thing that ever
// noticed was a member trying to create a Page. `getPool()` threw the right
// message from too deep to be useful, and nothing else could ask the question
// without also opening a connection.

export const POOL_ENV_NAMES = [
  'DATABASE_URL',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_URL',
] as const

export type PoolEnvName = (typeof POOL_ENV_NAMES)[number]

export type ConnectionStringResolution =
  | { ok: true; connectionString: string; source: PoolEnvName }
  | { ok: false; reason: 'unconfigured'; message: string }

export const UNCONFIGURED_MESSAGE =
  `Action layer DB pool: no connection string. Set ${POOL_ENV_NAMES[0]} ` +
  `(or ${POOL_ENV_NAMES[1]} / ${POOL_ENV_NAMES[2]}) in this environment. ` +
  'On Vercel it belongs in BOTH Production and Preview, as the Supabase ' +
  'Supavisor pooler URL — the direct db.<ref>.supabase.co host publishes no ' +
  'A record and is unreachable from IPv4-only runtimes. See INFRASTRUCTURE.md ' +
  '§ Environment variables.'

export function resolveConnectionString(
  env: Record<string, string | undefined>,
): ConnectionStringResolution {
  for (const name of POOL_ENV_NAMES) {
    // Trim before testing: a variable declared-but-blank in a dashboard arrives
    // as '' and `??` would accept it, handing `new Pool` a string that fails
    // later and worse. Blank means unset.
    const value = env[name]?.trim()
    if (value) return { ok: true, connectionString: value, source: name }
  }
  return { ok: false, reason: 'unconfigured', message: UNCONFIGURED_MESSAGE }
}

/**
 * bug #457 — on Vercel every function instance opens its own pool, and the
 * session-mode pooler (port 5432) allows only 15 clients in all, so a few
 * instances exhausted it (EMAXCONNSESSION) and Pages and Explore failed.
 * Supabase's guidance for serverless is the transaction-mode pooler, port 6543,
 * on the same host. This moves a Supabase session-pooler URL to it on Vercel
 * only; CI, local and scripts keep the connection they were given. Nothing is
 * logged: the string holds a password.
 */
export function toTransactionPooler(connectionString: string, env: Record<string, string | undefined>): string {
  if (env.VERCEL !== '1') return connectionString
  try {
    const url = new URL(connectionString)
    if (!url.hostname.endsWith('.pooler.supabase.com') || url.port !== '5432') return connectionString
    url.port = '6543'
    return url.toString()
  } catch {
    return connectionString
  }
}
