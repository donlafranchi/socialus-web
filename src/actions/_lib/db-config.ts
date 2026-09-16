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
