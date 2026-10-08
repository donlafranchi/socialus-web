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
