// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { knowledgeDatabaseUrl } from '@/actions/_lib/knowledge-db'

// F125 / T1018 (#1219) — the lookup tool's route: who it lets in, and that it
// speaks MCP end to end as the store's own login. The end-to-end half sets a
// password on that login and keeps an agent, so it runs only on a throwaway
// database (SUPABASE_TEST_EPHEMERAL=1, which CI's unit job sets).

describe('the connection the tool uses', () => {
  it("is the store's own login on the pooler, built from the app's project address and one password", () => {
    const url = knowledgeDatabaseUrl({
      NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      KNOWLEDGE_DB_PASSWORD: 'p@ss:/word#1',
    })
    expect(url).toBe(
      'postgresql://knowledge_store.abcdefghijklmnopqrst:p%40ss%3A%2Fword%231@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
    )
  })

  it('never falls back to another login', () => {
    expect(knowledgeDatabaseUrl({ NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' })).toBeNull()
    expect(knowledgeDatabaseUrl({ KNOWLEDGE_DB_PASSWORD: 'x', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })).toBeNull()
    expect(
      knowledgeDatabaseUrl({ KNOWLEDGE_DATABASE_URL: 'postgresql://postgres:x@db.example/postgres' }),
    ).toBeNull()
    expect(
      knowledgeDatabaseUrl({ KNOWLEDGE_DATABASE_URL: 'postgresql://knowledge_store:x@db.example/postgres?user=postgres' }),
    ).toBeNull()
  })

  it('takes a whole address for the store login when one is given', () => {
    expect(knowledgeDatabaseUrl({ KNOWLEDGE_DATABASE_URL: 'postgresql://knowledge_store:x@127.0.0.1:54322/postgres' })).toBe(
      'postgresql://knowledge_store:x@127.0.0.1:54322/postgres',
    )
  })
})

const mcp = (body: unknown, key?: string) =>
  new Request('http://localhost/api/knowledge/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  })

/** The streamable transport may answer as JSON or as one server-sent event. */
async function payload(res: Response): Promise<{ result?: Record<string, unknown>; error?: unknown }> {
  const text = await res.text()
  const data = text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data: '))?.slice(6) ?? '{}'
  return JSON.parse(data)
}

describe('who the route lets in', () => {
  it('answers 401 with no key, and asks for a bearer key', async () => {
    const { POST } = await import('@/app/api/knowledge/[transport]/route')
    const res = await POST(mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate') ?? '').toMatch(/Bearer/)
  })
})

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const E2E = requireRunnable({
  claim: "the lookup tool's route speaks MCP as the store's own login, one agent's key at a time",
  available: safety.safe && process.env.SUPABASE_TEST_EPHEMERAL === '1',
  remedy: `${safety.reason} It also sets a password on the store's login, so it runs only where SUPABASE_TEST_EPHEMERAL=1.`,
})

describe.skipIf(!E2E)('the route, end to end', () => {
  let admin: Client
  let key = ''
  const agent = `route-test-${Date.now()}`
  const saved = process.env.KNOWLEDGE_DATABASE_URL

  beforeAll(async () => {
    admin = new Client({ connectionString: DATABASE_URL })
    await admin.connect()
    const password = `route-test-${Math.random().toString(36).slice(2)}`
    await admin.query(`alter role knowledge_store password '${password}'`)
    const u = new URL(DATABASE_URL!)
    u.username = 'knowledge_store'
    u.password = password
    process.env.KNOWLEDGE_DATABASE_URL = u.toString()
    const { rows } = await admin.query<{ key: string }>(
      `select knowledge.add_agent($1, 'a tester', '{building}', false) as key`,
      [agent],
    )
    key = rows[0].key
  })

  afterAll(async () => {
    await admin?.query('select knowledge.revoke_agent($1)', [agent])
    await admin?.end()
    if (saved === undefined) delete process.env.KNOWLEDGE_DATABASE_URL
    else process.env.KNOWLEDGE_DATABASE_URL = saved
    const { closeKnowledgePool } = await import('@/actions/_lib/knowledge-db')
    await closeKnowledgePool()
  })

  it('answers 401 for a key the store does not know, and for a revoked one', async () => {
    const { POST } = await import('@/app/api/knowledge/[transport]/route')
    const res = await POST(mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'ks_not_a_real_key'))
    expect(res.status).toBe(401)
    const gone = `${agent}-revoked`
    const { rows } = await admin.query<{ key: string }>(
      `select knowledge.add_agent($1, 'a tester', '{building}', false) as key`,
      [gone],
    )
    const before = await POST(mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, rows[0].key))
    expect(before.status).not.toBe(401)
    await admin.query('select knowledge.revoke_agent($1)', [gone])
    const after = await POST(mcp({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, rows[0].key))
    expect(after.status).toBe(401)
  })

  it('lists the tools and answers a search, logging the one it cannot answer as this agent', async () => {
    const { POST } = await import('@/app/api/knowledge/[transport]/route')
    const init = await POST(
      mcp(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
        },
        key,
      ),
    )
    expect(init.status).toBe(200)
    const list = await payload(await POST(mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, key)))
    const names = (list.result?.tools as { name: string }[]).map((t) => t.name)
    expect(names).toContain('live')
    expect(names).toContain('search')

    const question = `Is there a rule about ${agent}?`
    const call = await payload(
      await POST(
        mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search', arguments: { question } } }, key),
      ),
    )
    const text = (call.result?.content as { text: string }[])[0].text
    expect(text).toMatch(/nothing/i)
    const { rows } = await admin.query(`select agent, person from knowledge.unanswered where question = $1`, [question])
    expect(rows).toEqual([{ agent, person: 'a tester' }])
  })
})
