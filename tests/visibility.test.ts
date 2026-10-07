// chore #430 — the visibility matrix against the local stack. Every cell of
// evals/visibility/matrix.ts is read as that viewer and must equal what the
// matrix says. A policy that opens up (or closes) is a red cell. The matrix
// proves itself on a deliberately open table it must reject ([guard-proves-itself]).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { PERSONAS } from '../evals/personas'
import { MEMBER_ID_READS, RESOURCES, VIEWERS, cellFor, parentTable, type Cell, type Viewer } from '../evals/visibility/matrix'

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
requireRunnable({
  claim: 'each persona reads exactly the rows the visibility matrix says, and no more',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const BUILDER = '0a000000-0000-4000-8000-000000000007'
const BUILDER_PAGE = '0b000000-0000-4000-8000-000000000007'
const sub = (v: Viewer) => (v === 'builder' ? BUILDER : v === 'signedOut' ? null : PERSONAS.find((p) => p.key === v)!.id)

/** "" when the viewer sees what the cell says; else what differs. */
export function judge(cell: Cell, actual: number): string {
  if (cell.reach === 'none' && actual !== 0) return `expected nothing, read ${actual}`
  return actual === cell.rows ? '' : `expected ${cell.rows} (${cell.reach}), read ${actual}`
}

let pool: Pool
let client: PoolClient

async function readAs(viewer: Viewer, sql: string): Promise<number> {
  await client.query('savepoint v')
  try {
    const id = sub(viewer)
    if (id) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: 'authenticated' })])
    await client.query(`set local role ${id ? 'authenticated' : 'anon'}`)
    return Number((await client.query(sql)).rows[0].n)
  } catch (e) {
    // A permission error is the strongest "none".
    if ((e as { code?: string }).code === '42501') return 0
    throw e
  } finally {
    await client.query('rollback to savepoint v')
  }
}

beforeAll(async () => {
  if (!safety.safe) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query('begin')
  // A builder, their Page, and their join of a real Page: all rolled back at the end.
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
       email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-visibility-builder@example.test',
       'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '')`,
    [BUILDER],
  )
  await client.query(
    `insert into public.members (id, handle, display_name, stakeholder_visibility, home_metro_id)
     values ($1, 'qa-visibility-builder', 'QA Builder', 'public', (select id from public.metro_polygons where slug = 'sacramento-roseville-ca'))`,
    [BUILDER],
  )
  await client.query(`insert into public.builders (member_id, persona) values ($1, 'visibility-matrix')`, [BUILDER])
  await client.query(
    `insert into public.groups (id, kind, purpose, name, slug, public_id, description, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1, 'group', 'gather', 'QA Visibility Builder', 'qa-visibility-builder', 'qa0v07', 'A builder Page for the visibility matrix.', 'active', 'listed', $2, '0c000000-0000-4000-8000-000000000001')`,
    [BUILDER_PAGE, BUILDER],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship, confirmed_by_member_id, confirmed_at)
     values ('0b000000-0000-4000-8000-000000000003', $1, 'member', 'explicit', 'member', '0a000000-0000-4000-8000-000000000013', now())`,
    [BUILDER],
  )
})

afterAll(async () => {
  if (!client) return
  await client.query('rollback').catch(() => {})
  client.release()
  await pool.end()
})

describe('the matrix is consistent', () => {
  it('a none cell reads nothing, and an all cell reads the whole resource', () => {
    for (const r of RESOURCES) for (const v of VIEWERS) {
      const c = cellFor(r, v)
      if (c.reach === 'none') expect(c.rows, `${r.name} / ${v}`).toBe(0)
      if (c.reach === 'all') expect(c.rows, `${r.name} / ${v}`).toBe(r.total)
    }
  })
})

describe.skipIf(!safety.safe)('every viewer reads what the matrix says', () => {
  for (const r of RESOURCES) {
    it(r.name, async () => {
      await client.query('update public.builder_content set visible = $1', [r.switch !== 'off'])
      const bad: string[] = []
      const pending: string[] = []
      for (const v of VIEWERS) {
        const cell = cellFor(r, v)
        const problem = judge(cell, await readAs(v, r.sql))
        if (problem) bad.push(`${v}: ${problem}`)
        if (cell.pending) pending.push(`${v}: ${cell.pending}`)
      }
      if (pending.length) console.warn(`[pending ruling] ${r.name}\n  ${[...new Set(pending.map((p) => p.split(': ').slice(1).join(': ')))].join('\n  ')}`)
      expect(bad, `${r.name}`).toEqual([])
    })
  }
})

// #246 — every selectable column holding a member's id, found from the catalog.
const MEMBER_ID_COLUMNS = `
  select distinct k.relname as t, a.attname as c
    from pg_class k
    join pg_attribute a on a.attrelid = k.oid and a.attnum > 0 and not a.attisdropped
   where k.relnamespace = 'public'::regnamespace and k.relkind in ('r', 'p', 'v', 'm')
     and a.atttypid = 'uuid'::regtype
     and (has_column_privilege('anon', k.oid, a.attnum, 'select') or has_column_privilege('authenticated', k.oid, a.attnum, 'select'))
     and (a.attname ~ '(member_id|founder|created_by)$'
          or exists (select 1 from pg_constraint f where f.conrelid = k.oid and f.contype = 'f' and a.attnum = any (f.conkey)
                       and f.confrelid in ('public.members'::regclass, 'auth.users'::regclass)))
   order by 1, 2`

/** "table.column (n)" for each column where the viewer reads someone else's id and no ruling allows it. */
async function memberIdLeaks(viewer: Viewer): Promise<string[]> {
  const { rows } = await client.query<{ t: string; c: string }>(MEMBER_ID_COLUMNS)
  const self = sub(viewer)
  const leaks: string[] = []
  for (const { t, c } of rows) {
    if (self && MEMBER_ID_READS[`${parentTable(t)}.${c}`]) continue
    const n = await readAs(viewer, `select count(*)::int n from public."${t}" where "${c}" is not null and "${c}" is distinct from ${self ? `'${self}'::uuid` : 'null'}`)
    if (n > 0) leaks.push(`${t}.${c} (${n})`)
  }
  return leaks
}

describe.skipIf(!safety.safe)("no viewer reads another member's id without a ruling (#246)", () => {
  for (const v of VIEWERS) {
    it(v, async () => {
      expect(await memberIdLeaks(v)).toEqual([])
    })
  }

  it('the sweep finds a new table that hands out member ids (guard)', async () => {
    await client.query('savepoint sweep_guard')
    try {
      await client.query('create table public.vis_bad_member_ids (member_id uuid references public.members (id))')
      await client.query(`insert into public.vis_bad_member_ids values ('${PERSONAS.find((p) => p.key === 'member')!.id}')`)
      await client.query('alter table public.vis_bad_member_ids enable row level security')
      await client.query('create policy open_to_all on public.vis_bad_member_ids for select using (true)')
      await client.query('grant select on public.vis_bad_member_ids to anon, authenticated')
      expect(await memberIdLeaks('signedOut')).toContain('vis_bad_member_ids.member_id (1)')
      expect(await memberIdLeaks('stranger')).toContain('vis_bad_member_ids.member_id (1)')
    } finally {
      await client.query('rollback to savepoint sweep_guard')
    }
  })
})

describe.skipIf(!safety.safe)('the matrix can fail (guard)', () => {
  it('rejects a table that is open to anyone', async () => {
    await client.query('create table public.vis_bad_fixture (id int)')
    await client.query('insert into public.vis_bad_fixture values (1), (2)')
    await client.query('alter table public.vis_bad_fixture enable row level security')
    await client.query('create policy open_to_all on public.vis_bad_fixture for select using (true)')
    await client.query('grant select on public.vis_bad_fixture to anon, authenticated')
    const read = await readAs('signedOut', 'select count(*)::int n from public.vis_bad_fixture')
    expect(read).toBe(2)
    expect(judge({ reach: 'none', rows: 0 }, read)).not.toBe('')
  })

  it('accepts a table that is closed', async () => {
    await client.query('create table public.vis_good_fixture (id int)')
    await client.query('insert into public.vis_good_fixture values (1)')
    await client.query('alter table public.vis_good_fixture enable row level security')
    await client.query('grant select on public.vis_good_fixture to anon, authenticated')
    expect(judge({ reach: 'none', rows: 0 }, await readAs('signedOut', 'select count(*)::int n from public.vis_good_fixture'))).toBe('')
  })
})
