import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { addAgentWithKey, problemWithSecret, revokeAgent, setPassword } from '../scripts/knowledge/keys'

// F125 / T1018 (#1219) — the keys workflow's script: a key the PM chose is
// stored the way knowledge.add_agent stores one, so the store's own login
// recognises it, and a secret that would break a connection is caught first.

describe('a secret the PM pastes', () => {
  it('is refused when it is short, padded, or has a quote in it', () => {
    expect(problemWithSecret(undefined, 32, 'K')).toMatch(/empty/)
    expect(problemWithSecret('a'.repeat(31), 32, 'K')).toMatch(/at least 32/)
    expect(problemWithSecret(` ${'a'.repeat(40)}`, 32, 'K')).toMatch(/space/)
    expect(problemWithSecret(`${'a'.repeat(40)}'`, 32, 'K')).toMatch(/quote/)
    expect(problemWithSecret('a'.repeat(40), 32, 'K')).toBeNull()
  })
})

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "a key registered by the keys workflow is the key the store's own login recognises",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('the keys workflow', () => {
  let pool: Pool
  let db: PoolClient

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
  })

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
  })

  it('registers a chosen key that the store login recognises, once per name, and revokes it', async () => {
    const key = `k-${'x'.repeat(40)}-${Date.now()}`
    await setPassword(db, `p-${'y'.repeat(30)}`)
    await addAgentWithKey(db, { agent: 'keys-test', person: 'a tester', departments: ['building'], operator: false, key })
    await expect(
      addAgentWithKey(db, { agent: 'keys-test', person: 'a tester', departments: ['building'], operator: false, key: `${key}2` }),
    ).rejects.toThrow(/already an agent/)
    await expect(
      addAgentWithKey(db, { agent: 'keys-test-2', person: 'a tester', departments: ['nowhere'], operator: false, key: `${key}3` }),
    ).rejects.toThrow(/No such department/)

    await db.query('savepoint as_store')
    await db.query('grant knowledge_store to current_user')
    await db.query('set local role knowledge_store')
    await db.query(`select set_config('knowledge.key', $1, true)`, [key])
    const { rows } = await db.query<{ who: { agent: string; departments: string[] } }>('select knowledge.whoami() as who')
    expect(rows[0].who).toMatchObject({ agent: 'keys-test', departments: ['building'] })
    await db.query('rollback to savepoint as_store')

    expect(await revokeAgent(db, 'keys-test')).toBe(true)
    expect(await revokeAgent(db, 'keys-test')).toBe(false)
  })
})
