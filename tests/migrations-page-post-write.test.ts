// F072 (#114) — what the write half of a Page post needs from the schema.
//
// Two gaps, both found by building the composer against the shipped table:
//
//   1. `group_events.event_kind` has a CHECK allowlist, and F072 acceptance 6
//      requires the post row and its event row in one transaction. Without the
//      two new kinds the event write raises and takes the post with it, which
//      is the right failure mode and the wrong outcome.
//
//   2. F072 acceptance 3 asks `page_posts` to carry a nullable reference to a
//      parent post *from its first migration*. T162's migration did not, and
//      it is already applied in production, so this is the second migration
//      and the criterion is met late rather than not at all. Added now, while
//      the table is empty, because that is the cheap moment. Nothing reads it
//      yet: replies are F072 § Not this.

import { describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { requireRunnable } from './support/runnable'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const FILE = readdirSync(MIG).find((f) => /^\d{14}_page_post_write\.sql$/.test(f))

describe('F072 — the migration file', () => {
  it('exists, timestamped per #39', () => {
    expect(FILE, 'expected a YYYYMMDDHHMMSS_page_post_write.sql').toBeTruthy()
  })

  const raw = FILE && existsSync(resolve(MIG, FILE)) ? readFileSync(resolve(MIG, FILE), 'utf8') : ''
  const sql = raw
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/'(?:[^']|'')*'/g, "''")

  it('restates the whole allowlist rather than appending to it', () => {
    // A CHECK cannot be extended in place; it is dropped and rebuilt. Every
    // prior kind must therefore be repeated, and the ones that go missing are
    // the ones nothing notices until a write fails in production.
    for (const kind of [
      'group.created', 'group.activated', 'group.member_joined', 'group.member_left',
      'group.role_changed', 'group.steward_transferred', 'group.dormant',
      'group.dormancy_extended', 'group.revived', 'group.dissolved',
      'group.photo_set', 'group.photo_removed', 'group.updated',
      'group.reported', 'group.photo_hidden', 'group.photo_restored',
    ]) {
      expect(raw, `the rebuilt allowlist dropped ${kind}`).toContain(`'${kind}'`)
    }
  })

  it('opens no direct write path to page_posts', () => {
    // ADR-7: writes go through the action layer. A policy added here would
    // let a client skip the event log.
    expect(sql.toLowerCase()).not.toMatch(/create policy[\s\S]*?for (insert|update|delete)/)
  })

  it('never derives anything from payment', () => {
    for (const word of ['payment', 'paid', 'subscription', 'promoted', 'sponsored', 'boost']) {
      expect(sql.toLowerCase(), `this DDL must not mention ${word}`).not.toContain(word)
    }
  })
})

const RUNNABLE = requireRunnable({
  claim: 'a Page post can record its event, and page_posts can carry a parent',
  available: !!DATABASE_URL,
  remedy:
    'run `supabase start`, then put DATABASE_URL in .env.test.local ' +
    '(recipe in .env.local.example)',
})

describe.skipIf(!RUNNABLE)('F072 — as shipped', () => {
  const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    try {
      const { rows } = await pool.query(sql, params)
      return rows as T[]
    } finally {
      await pool.end()
    }
  }

  it('admits the two post event kinds', async () => {
    const rows = await query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.group_events'::regclass
          and conname = 'group_events_event_kind_check'`,
    )
    expect(rows[0]?.def).toContain('group.post_created')
    expect(rows[0]?.def).toContain('group.post_edited')
  })

  it('still admits every kind that was already in use', async () => {
    const rows = await query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.group_events'::regclass
          and conname = 'group_events_event_kind_check'`,
    )
    for (const kind of ['group.created', 'group.member_joined', 'group.reported', 'group.photo_hidden']) {
      expect(rows[0]?.def, `lost ${kind}`).toContain(kind)
    }
  })

  it('carries a nullable parent_post_id that points at page_posts', async () => {
    const cols = await query<{ is_nullable: string; data_type: string }>(
      `select is_nullable, data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'page_posts'
          and column_name = 'parent_post_id'`,
    )
    expect(cols[0]?.is_nullable).toBe('YES')
    expect(cols[0]?.data_type).toBe('uuid')

    const fks = await query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.page_posts'::regclass and contype = 'f'`,
    )
    const self = fks.map((r) => r.def).find((d) => /parent_post_id/i.test(d))
    expect(self).toBeTruthy()
    expect(self!.toLowerCase()).toContain('references page_posts')
  })

  it('still refuses a kind nobody defined', async () => {
    await expect(
      query(
        `insert into public.group_events (group_id, event_kind, payload)
         values (gen_random_uuid(), 'group.invented', '{}'::jsonb)`,
      ),
    ).rejects.toThrow()
  })
})
