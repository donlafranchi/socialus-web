// #280 — the real operator's queue holds no builder report and no report on a
// builder Page; the builder operator's holds both.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn(async () => ({ rows: [] }))
vi.mock('@/actions/_lib/db', () => ({ getPool: () => ({ query }) }))

import { fetchReviewQueue } from './reports-queue'

beforeEach(() => query.mockClear())

describe('#280 — builders in the report queue', () => {
  it('leaves builder reports and builder Pages out by default', async () => {
    await fetchReviewQueue()
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toMatch(/\$2 or \(not public\.is_builder\(r\.reporter_member_id\) and not public\.is_builder\(pg\.founder_member_id\)\)/)
    expect(params[1]).toBe(false)
  })

  it('includes them for the builder operator', async () => {
    await fetchReviewQueue(50, { includeBuilders: true })
    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(params[1]).toBe(true)
  })
})

// F099 criterion 8 — a Page picture and a post photo are reported subjects of their own.
describe('F099 — the queue holds every kind of reported image', () => {
  it('reads the Page photo, the Page picture and a post photo, each with its own state', async () => {
    await fetchReviewQueue()
    const [sql] = query.mock.calls[0] as unknown as [string]
    expect(sql).toMatch(/subject_kind = 'group'/)
    expect(sql).toMatch(/g\.picture_hidden_at[\s\S]*subject_kind = 'page_picture'/)
    expect(sql).toMatch(/pp\.photo_hidden_at[\s\S]*join public\.page_posts pp[\s\S]*subject_kind = 'post_photo'/)
  })

  it('names what was reported and which id it is', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          report_id: 'r1', body: 'x', category: 'other', reported_at: new Date(), hidden_at: null, removed_at: null,
          group_id: 'g1', group_name: 'Bakery', group_slug: 'b', photo_url: 'https://x/p.webp',
          owner_display_name: null, owner_handle: null, subject_kind: 'post_photo', subject_id: 'p1',
        },
      ],
    } as never)
    const [r] = await fetchReviewQueue()
    expect(r!.subjectKind).toBe('post_photo')
    expect(r!.subjectId).toBe('p1')
    expect(r!.groupId).toBe('g1')
  })
})

// #626 — a first report is a courtesy notice to the owner, not staff work.
describe('#626 — the queue holds no courtesy-only report', () => {
  it('leaves out a report that only sent a courtesy notice, until the item is hidden or decided', async () => {
    await fetchReviewQueue()
    const [sql] = query.mock.calls[0] as unknown as [string]
    expect(sql).toMatch(/n\.report_id = r\.id and n\.kind = 'courtesy'/)
    expect(sql).toMatch(/s\.hidden_at is not null[\s\S]*r\.reviewed_at is not null|r\.reviewed_at is not null[\s\S]*s\.hidden_at is not null/)
  })

  it('reads a mistake claim from either kind of notice', async () => {
    await fetchReviewQueue()
    const [sql] = query.mock.calls[0] as unknown as [string]
    expect(sql).toMatch(/json_build_object\('kind', a\.kind/)
  })
})

// F101.12 (#634) — every AI read of a report comes with the queue, newest first, not only the latest.
describe('F101.12 — every earlier AI read', () => {
  it('reads all assessments of the reports in the queue and attaches them to each report', async () => {
    const row = { report_id: 'r1', body: 'x', category: 'spam', reported_at: new Date(), hidden_at: null, removed_at: null, group_id: 'g1', group_name: 'B', group_slug: 'b', photo_url: null, owner_display_name: null, owner_handle: null, subject_kind: 'group', subject_id: 'g1' }
    const a1 = { report_id: 'r1', created_at: new Date('2026-10-03'), model: 'm2', outcome: 'remove', severity: 2, confidence: '0.9', reason: 'later', skipped_reason: null }
    const a0 = { report_id: 'r1', created_at: new Date('2026-10-02'), model: 'm1', outcome: 'approve', severity: 4, confidence: '0.6', reason: 'earlier', skipped_reason: null }
    query.mockImplementation((async (sql: string) => {
      if (/from public\.report_assessments/i.test(sql) && /any\(\$1/i.test(sql)) return { rows: [a1, a0] }
      if (/report_decisions/i.test(sql)) return { rows: [] }
      return { rows: [row] }
    }) as never)
    const [r] = await fetchReviewQueue()
    expect(r!.assessments!.map((a) => a.reason)).toEqual(['later', 'earlier'])
    expect(r!.assessments![0]).toMatchObject({ model: 'm2', outcome: 'remove', severity: 2, confidence: 0.9 })
    const sql = (query.mock.calls as unknown as [string][]).map(([q]) => q).find((q) => /from public\.report_assessments/i.test(q) && /any\(\$1/i.test(q))!
    expect(sql).toMatch(/order by created_at desc/i)
  })
})
