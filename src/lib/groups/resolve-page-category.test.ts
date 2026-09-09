import { describe, it, expect, vi, beforeEach } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('@/actions/_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) =>
    fn({ query }),
  ),
}))

import { resolvePageCategoryOtherText } from './resolve-page-category'

beforeEach(() => {
  query.mockReset()
})

describe('resolvePageCategoryOtherText', () => {
  it('returns the most recent suggestion\'s raw text', async () => {
    query.mockResolvedValueOnce({ rows: [{ raw_text: 'I fix bicycles on weekends' }] })
    const result = await resolvePageCategoryOtherText('group-1')
    expect(result).toBe('I fix bicycles on weekends')
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/order by created_at desc/i)
    expect(params).toEqual(['group-1'])
  })

  it('returns null when there is no suggestion row', async () => {
    query.mockResolvedValueOnce({ rows: [] })
    const result = await resolvePageCategoryOtherText('group-1')
    expect(result).toBeNull()
  })
})
