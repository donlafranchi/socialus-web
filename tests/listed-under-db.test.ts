import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #1180 — existing tags are mapped once onto the shared list. Runs the migration's mapping half against seeded
// rows inside a transaction and rolls it back, so it checks the SQL that ships, not a copy of it.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'existing tags map once onto the shared list',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4000000-0000-4000-8000-000000001180'

const MIGRATION = readFileSync(path.join(__dirname, '../supabase/migrations/20261105120000_listed_under.sql'), 'utf8')
// Scoped to this file's own Pages: the suite shares one database, and mapping every Page from an open transaction
// would wait on other files' rows.
const scope = (sql: string, find: string, add: string) => {
  if (!sql.includes(find)) throw new Error(`the migration no longer has: ${find}`)
  return sql.replace(find, `${find} ${add}`)
}
const MAPPING = scope(
  scope(MIGRATION.slice(MIGRATION.indexOf('create temp table label_words')), 'from public.groups gr\n', `where gr.founder_member_id = '${OWNER}'\n`),
  'join public.tags t on t.id = ptg.tag_id\n',
  `where gr.founder_member_id = '${OWNER}'\n`,
)
const ANCHOR = 'd4000000-0000-4000-8000-000000001180'
const BAKERY = 'c4000000-0000-4000-8000-000000001181'
const POTTERY = 'c4000000-0000-4000-8000-000000001182'
const PLAIN = 'c4000000-0000-4000-8000-000000001183'
const REPAIR = 'c4000000-0000-4000-8000-000000001184'
const TWO = 'c4000000-0000-4000-8000-000000001185'
const FREE_POST = 'e4000000-0000-4000-8000-000000001183'
const CONCERT_POST = 'e4000000-0000-4000-8000-000000001181'
const ODD_POST = 'e4000000-0000-4000-8000-000000001182'

let pool: Pool
let client: PoolClient

async function tag(label: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into public.tags (label, normalized, created_by) values ($1, lower($1), $2)
     on conflict (normalized) do update set label = excluded.label returning id`,
    [label, OWNER],
  )
  return r.rows[0]!.id
}

const labelsOf = async (table: 'page_tags' | 'post_tags', col: 'group_id' | 'post_id', id: string) =>
  (await client.query<{ label: string }>(`select t.label from public.${table} x join public.tags t on t.id = x.tag_id where x.${col} = $1 order by t.label`, [id])).rows.map((r) => r.label)

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query('begin')
  await client.query(`set local lock_timeout = '20s'`)
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','l1180@test.invalid','x',now(),now(),now())`,
    [OWNER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'l1180','l1180')`, [OWNER])
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','Hall','l1180-hall', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [ANCHOR, OWNER],
  )
  for (const [id, name, description] of [
    [BAKERY, 'Oak Loaves', 'Bread.'],
    [POTTERY, 'Riverside Pottery Studio', 'Wheel classes.'],
    [REPAIR, 'Repair Cafe Regulars', 'Bring it broken.'],
    [TWO, 'Corner Stand', 'Open Saturdays.'],
    [PLAIN, 'Hello', 'There.'],
  ]) {
    await client.query(
      `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ($1,'business',$2,$3,$4,'active','listed',$5,$6)`,
      [id, name, `l1180-${id.slice(-4)}`, description, OWNER, ANCHOR],
    )
  }
  await client.query(`insert into public.page_tags (group_id, tag_id) values ($1, $2)`, [BAKERY, await tag('sourdough')])
  await client.query(`insert into public.page_tags (group_id, tag_id) values ($1, $2)`, [PLAIN, await tag('zzqx')])
  await client.query(`insert into public.page_tags (group_id, tag_id) values ($1, $2)`, [POTTERY, await tag('Local food')])
  await client.query(`insert into public.page_posts (id, group_id, body, lifecycle_state) values ($1,$2,'Friday','active'), ($3,$2,'Hi','active')`, [CONCERT_POST, BAKERY, ODD_POST])
  await client.query(`insert into public.post_tags (post_id, tag_id) values ($1, $2)`, [CONCERT_POST, await tag('Concert')])
  await client.query(`insert into public.post_tags (post_id, tag_id) values ($1, $2)`, [ODD_POST, await tag('qqzz')])
  for (const l of ['Food & drink', 'Farmers markets']) await client.query(`insert into public.page_tags (group_id, tag_id) values ($1, $2)`, [TWO, await tag(l)])
  await client.query(`insert into public.page_posts (id, group_id, body, lifecycle_state) values ($1,$2,'Saturday','active')`, [FREE_POST, BAKERY])
  await client.query(`insert into public.post_tags (post_id, tag_id) values ($1, $2)`, [FREE_POST, await tag('free')])
  await client.query(MAPPING)
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query('rollback')
  client.release()
  await pool.end()
})

describe('#1180 — existing tags map once onto the list', () => {
  it.runIf(RUNNABLE)('a Page tag maps to its top label and finer one', async () => {
    expect(await labelsOf('page_tags', 'group_id', BAKERY)).toEqual(['Bakery', 'Food & drink'])
  })

  it.runIf(RUNNABLE)('its name and description count with its tags, and a tie goes to the more specific', async () => {
    expect(await labelsOf('page_tags', 'group_id', POTTERY)).toEqual(['Crafts & makers', 'Pottery'])
  })

  it.runIf(RUNNABLE)('a phrase outweighs a word inside it', async () => {
    expect(await labelsOf('page_tags', 'group_id', REPAIR)).toEqual(['Repair & reuse', 'Sustainability'])
  })

  it.runIf(RUNNABLE)('a Page whose words match nothing lands under Neighborhood life', async () => {
    expect(await labelsOf('page_tags', 'group_id', PLAIN)).toEqual(['Neighborhood life'])
  })

  it.runIf(RUNNABLE)("a post's own tag maps too", async () => {
    expect(await labelsOf('post_tags', 'post_id', CONCERT_POST)).toEqual(['Concerts', 'Live music'])
  })

  it.runIf(RUNNABLE)("a post's own tag that matches nothing is dropped, so it carries its Page's", async () => {
    expect(await labelsOf('post_tags', 'post_id', ODD_POST)).toEqual([])
  })

  it.runIf(RUNNABLE)("old tags that already are list labels stay, both of an unclaimed Page's interests", async () => {
    expect(await labelsOf('page_tags', 'group_id', TWO)).toEqual(['Farmers markets', 'Food & drink'])
  })

  it.runIf(RUNNABLE)('a "free" tag keeps the free-things lens, in the list spelling', async () => {
    expect(await labelsOf('post_tags', 'post_id', FREE_POST)).toEqual(['Free'])
  })

  it.runIf(RUNNABLE)('the list labels it wrote are safe, never in the review queue', async () => {
    const r = await client.query<{ review: string }>(`select review from public.tags where normalized in ('food & drink','bakery','neighborhood life')`)
    expect(r.rows.map((x) => x.review)).toEqual(['safe', 'safe', 'safe'])
  })
})
