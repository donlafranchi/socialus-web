// F125 / T1018 (#1219) — the knowledge store's keys, run by a manual workflow
// (.github/workflows/knowledge-keys.yml) so the PM can do it from a phone.
//
// Three things, each as the schema owner on the admin connection:
//   password  sets the store's own login's password from KNOWLEDGE_DB_PASSWORD,
//             the same value the app reads on Vercel to connect as that login.
//   add       registers one agent with the key in KNOWLEDGE_AGENT_KEY. The PM
//             chooses the key (a long random string from a password manager)
//             and keeps it in a GitHub secret, so it is never printed: this
//             repository's Actions logs are public. Only its hash is stored,
//             exactly as knowledge.add_agent stores one.
//   revoke    revokes one agent's key. Nothing is deleted.
// Then it checks, over the pooler and as the store's own login, that the key
// is recognised: the same path the lookup tool takes.
//
// Run: tsx scripts/knowledge/keys.ts <password|add|revoke> [--agent name]
//      [--person "the PM"] [--departments a,b] [--operator]
// with DATABASE_URL (admin). The check also needs SUPABASE_PROJECT_REF.

import { Client, type ClientBase } from 'pg'

export const MIN_KEY_LENGTH = 32
export const MIN_PASSWORD_LENGTH = 24

export function problemWithSecret(value: string | undefined, min: number, name: string): string | null {
  if (!value) return `${name} is empty. Add it under GitHub → Settings → Secrets and variables → Actions.`
  if (value.trim() !== value) return `${name} has a space or a line break around it. Paste it again without one.`
  if (value.length < min) return `${name} is ${value.length} characters; use at least ${min}, from a password manager.`
  if (/['"\\]/.test(value)) return `${name} contains a quote or a backslash; generate one without those.`
  return null
}

export async function setPassword(db: ClientBase, password: string): Promise<void> {
  const { rows } = await db.query<{ sql: string }>(`select format('alter role knowledge_store password %L', $1::text) as sql`, [
    password,
  ])
  await db.query(rows[0].sql)
}

/** Registers an agent under a key the caller chose; the same hash knowledge.add_agent keeps. */
export async function addAgentWithKey(
  db: ClientBase,
  a: { agent: string; person: string; departments: string[]; operator: boolean; key: string },
): Promise<void> {
  const existing = await db.query('select 1 from knowledge.agents where name = $1', [a.agent])
  if (existing.rowCount) {
    throw new Error(`There is already an agent called ${a.agent}. A new key gets a new name; revoke the old one.`)
  }
  const bad = await db.query<{ d: string }>(
    'select d from unnest($1::text[]) d where not exists (select 1 from knowledge.departments x where x.slug = d)',
    [a.departments],
  )
  if (bad.rowCount) throw new Error(`No such department: ${bad.rows.map((r) => r.d).join(', ')}.`)
  await db.query(
    `insert into knowledge.agents (name, person, departments, operator, key_hash)
     values ($1, $2, $3, $4, encode(sha256(convert_to($5, 'UTF8')), 'hex'))`,
    [a.agent, a.person, a.departments, a.operator, a.key],
  )
}

export async function revokeAgent(db: ClientBase, agent: string): Promise<boolean> {
  const { rowCount } = await db.query('select 1 from knowledge.agents where name = $1 and revoked_at is null', [agent])
  if (!rowCount) return false
  await db.query('select knowledge.revoke_agent($1)', [agent])
  return true
}

/** As the store's own login: who this key is, or null. */
export async function whoIs(storeUrl: string, key: string): Promise<Record<string, unknown> | null> {
  const db = new Client({ connectionString: storeUrl, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(storeUrl) ? undefined : { rejectUnauthorized: false } })
  await db.connect()
  try {
    await db.query('begin')
    await db.query(`select set_config('knowledge.key', $1, true)`, [key])
    const { rows } = await db.query<{ who: Record<string, unknown> | null }>('select knowledge.whoami() as who')
    await db.query('rollback')
    return rows[0]?.who ?? null
  } finally {
    await db.end()
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const action = process.argv[2]
  const admin = process.env.DATABASE_URL
  if (!admin) throw new Error('DATABASE_URL is not set.')
  const ref = process.env.SUPABASE_PROJECT_REF
  const password = process.env.KNOWLEDGE_DB_PASSWORD
  const storeUrl =
    process.env.KNOWLEDGE_DATABASE_URL ??
    (ref && password
      ? `postgresql://knowledge_store.${ref}:${encodeURIComponent(password)}@${new URL(admin).hostname}:6543/postgres`
      : undefined)

  const db = new Client({ connectionString: admin })
  await db.connect()
  try {
    if (action === 'password') {
      const p = problemWithSecret(password, MIN_PASSWORD_LENGTH, 'KNOWLEDGE_DB_PASSWORD')
      if (p) throw new Error(p)
      await setPassword(db, password!)
      console.log("The store's own login has its password.")
      return
    }
    const agent = arg('agent')?.trim()
    if (!agent || !/^[a-z0-9][a-z0-9._-]*$/.test(agent)) {
      throw new Error('Give the agent a name: lowercase letters, digits, dots, dashes, such as cloud-sessions.')
    }
    if (action === 'revoke') {
      console.log((await revokeAgent(db, agent)) ? `${agent}'s key is revoked.` : `${agent} has no live key.`)
      return
    }
    if (action !== 'add') throw new Error('Say password, add or revoke.')
    const key = process.env.KNOWLEDGE_AGENT_KEY
    const p = problemWithSecret(key, MIN_KEY_LENGTH, 'KNOWLEDGE_AGENT_KEY')
    if (p) throw new Error(p)
    const departments = (arg('departments') ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
    const operator = process.argv.includes('--operator')
    if (!operator && departments.length === 0) {
      throw new Error("A key that is not the PM's names at least one department.")
    }
    await addAgentWithKey(db, { agent, person: arg('person') ?? 'the PM', departments, operator, key: key! })
    console.log(`${agent} is registered${operator ? ' with the PM\'s reach' : ` for ${departments.join(', ')}`}.`)
    if (!storeUrl) {
      console.log('Not checked: KNOWLEDGE_DB_PASSWORD is not set here, so the store login cannot be tried.')
      return
    }
    const who = await whoIs(storeUrl, key!)
    if (!who || who.agent !== agent) throw new Error("The store's own login does not recognise the new key.")
    console.log("Checked: the store's own login recognises the key, over the same pooler the app uses.")
  } finally {
    await db.end()
  }
}

if (process.argv[1] && /keys\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
