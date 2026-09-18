// The reversible-decisions migration. Asserted against the file, because the
// shape is the thing being reviewed and it must not drift after Don applies it.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(
  resolve(__dirname, '..', 'supabase/migrations/20260917210000_report_decisions_reversible.sql'),
  'utf8',
)

describe('the decisions log is append-only and attributable', () => {
  it('creates report_decisions', () => {
    expect(sql).toMatch(/create table public\.report_decisions/)
  })

  it('never allows an unattributable decision', () => {
    expect(sql).toMatch(/decided_by_member_id\s+uuid\s+not null/)
  })

  it('records what a reversal undid rather than editing it', () => {
    expect(sql).toMatch(/reverses_decision_id\s+uuid\s+references public\.report_decisions\(id\)/)
  })

  it('allows only one reversal per decision — two is how reviewers ping-pong', () => {
    expect(sql).toMatch(/create unique index idx_report_decisions_one_reversal/)
  })

  it('refuses "other" with nothing written', () => {
    expect(sql).toMatch(/report_decisions_other_needs_a_note/)
  })

  it('has no RLS policy — every read is server-side, like reports', () => {
    expect(sql).toMatch(/alter table public\.report_decisions enable row level security/)
    expect(sql).not.toMatch(/create policy[\s\S]*report_decisions/)
  })

  it('says which side is authoritative', () => {
    expect(sql).toMatch(/THE SOURCE OF TRUTH/)
    expect(sql).toMatch(/reports\.reviewed_at[\s\S]{0,120}PROJECTION/)
  })
})

describe('removal stops destroying the photo', () => {
  it('adds photo_removed_at', () => {
    expect(sql).toMatch(/alter table public\.groups\s+add column photo_removed_at timestamptz/)
  })

  it('says the URL and the bytes are left intact, and why', () => {
    expect(sql).toMatch(/LEFT INTACT/)
    expect(sql).toMatch(/reversible/)
  })

  it('records the safety cost rather than leaving it to be discovered', () => {
    expect(sql).toMatch(/fetchable by direct storage URL/)
    expect(sql).toMatch(/purge-proposal\.md/)
  })
})

describe('history is complete from the start', () => {
  it('backfills a decision row for every review already made', () => {
    expect(sql).toMatch(/insert into public\.report_decisions[\s\S]*from public\.reports r/)
  })

  it('skips a review whose reviewer is gone rather than attributing it to nobody', () => {
    expect(sql).toMatch(/r\.reviewed_by_member_id is not null/)
  })

  it('is safe to re-run', () => {
    expect(sql).toMatch(/not exists \(select 1 from public\.report_decisions d/)
  })
})
