// #443 — problem.report: a signed-in member's report goes to a private table,
// and only there. Rate-limited, so a stuck button or a script can't fill it.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('../_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }) }))

import { problemReport, REPORTS_PER_MEMBER_PER_HOUR, REPORTS_PER_HOUR } from './report'
import { ValidationError } from '../_lib/errors'

const ME = '11111111-1111-1111-1111-111111111111'
const ctx = { actingMemberId: ME, now: () => new Date('2026-10-08T01:00:00Z') } as never
const input = { description: 'The Save button did nothing', route: '/g/abc123', userAgent: 'Mozilla/5.0', buildSha: '0b26c0d' }

beforeEach(() => query.mockReset())

const counts = (mine: number, all: number) =>
  query.mockResolvedValueOnce({ rows: [{ mine: String(mine), everyone: String(all) }], rowCount: 1 })

describe('problemReport', () => {
  it('writes the report with the acting member and their role, and returns only its id', async () => {
    counts(0, 0)
    query.mockResolvedValueOnce({ rows: [{ id: 'r1' }], rowCount: 1 })
    await expect(problemReport(ctx, input)).resolves.toEqual({ reportId: 'r1' })
    const [sql, params] = query.mock.calls[1]!
    expect(sql).toMatch(/insert into public\.problem_reports/)
    expect(params).toEqual([ME, 'member', '/g/abc123', '0b26c0d', 'Mozilla/5.0', 'The Save button did nothing', new Date('2026-10-08T01:00:00Z')])
  })

  it('stops a member who has reported too many times this hour', async () => {
    counts(REPORTS_PER_MEMBER_PER_HOUR, 5)
    await expect(problemReport(ctx, input)).rejects.toBeInstanceOf(ValidationError)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('stops everyone when the whole platform is flooded', async () => {
    counts(0, REPORTS_PER_HOUR)
    await expect(problemReport(ctx, input)).rejects.toBeInstanceOf(ValidationError)
  })

  it('wants something said, and not too much', async () => {
    await expect(problemReport(ctx, { ...input, description: '   ' })).rejects.toThrow()
    await expect(problemReport(ctx, { ...input, description: 'x'.repeat(2001) })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })

  it('keeps only the path of the route, never a query string or fragment', async () => {
    counts(0, 0)
    query.mockResolvedValueOnce({ rows: [{ id: 'r1' }], rowCount: 1 })
    await problemReport(ctx, { ...input, route: '/you?tab=settings&email=maya@example.com#x' })
    expect(query.mock.calls[1]![1][2]).toBe('/you')
  })

  it('a missing member is not an anonymous report', async () => {
    await expect(problemReport({ actingMemberId: 'self-bootstrap', now: () => new Date() } as never, input)).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })
})
