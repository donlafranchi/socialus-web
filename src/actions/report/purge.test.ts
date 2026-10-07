// #491 — purge: the irreversible deletion of a removed photo (docs/purge-proposal.md).
// Two handlers: the target (validate + name the object) and the record (after the
// bytes are gone). Authorization is here, not in the UI.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('../_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }) }))
vi.mock('../_lib/operator', () => ({ isOperator: (id: string) => id === 'op-1' }))

import { reportPurgeTarget, reportPurge } from './purge'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'

const GROUP = '33333333-3333-3333-3333-333333333333'
const URL_ = 'https://x.supabase.co/storage/v1/object/public/media/m1/a.webp'
const operator = { actingMemberId: 'op-1', now: () => new Date('2026-10-07T12:00:00Z') } as never
const stranger = { actingMemberId: 'someone' } as never

const removed = { photo_url: URL_, photo_removed_at: new Date(), photo_purged_at: null }

beforeEach(() => query.mockReset())

describe('reportPurgeTarget', () => {
  it('refuses anyone but the operator, and reads nothing', async () => {
    await expect(reportPurgeTarget(stranger, { groupId: GROUP })).rejects.toBeInstanceOf(AuthorizationError)
    expect(query).not.toHaveBeenCalled()
  })

  it('names the object of a removed photo, and makes the database know the operator', async () => {
    query.mockResolvedValueOnce({ rows: [removed], rowCount: 1 }).mockResolvedValueOnce({ rowCount: 1, rows: [] })
    await expect(reportPurgeTarget(operator, { groupId: GROUP })).resolves.toEqual({ groupId: GROUP, objectPath: 'm1/a.webp' })
    expect(query.mock.calls[1]![0]).toMatch(/insert into public\.operators/)
    expect(query.mock.calls[1]![1]).toEqual(['op-1'])
  })

  it('only a removed photo can be deleted: a live or merely hidden one is refused', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...removed, photo_removed_at: null }], rowCount: 1 })
    await expect(reportPurgeTarget(operator, { groupId: GROUP })).rejects.toBeInstanceOf(ValidationError)
  })

  it('a photo already deleted is refused, not repeated', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...removed, photo_url: null, photo_purged_at: new Date() }], rowCount: 1 })
    await expect(reportPurgeTarget(operator, { groupId: GROUP })).rejects.toBeInstanceOf(ValidationError)
  })

  it('an unknown Page is not found', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    await expect(reportPurgeTarget(operator, { groupId: GROUP })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('reportPurge', () => {
  const input = { groupId: GROUP, objectPath: 'm1/a.webp', reasonCode: 'illegal_content' as const }

  it('refuses anyone but the operator', async () => {
    await expect(reportPurge(stranger, input)).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('records who, what and why, then clears the URL and stamps the Page', async () => {
    query
      .mockResolvedValueOnce({ rows: [removed], rowCount: 1 }) // lock + read
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }], rowCount: 1 }) // insert purge
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // update group
    await expect(reportPurge(operator, input)).resolves.toEqual({ purgeId: 'p1', groupId: GROUP })
    expect(query.mock.calls[1]![0]).toMatch(/insert into public\.photo_purges/)
    expect(query.mock.calls[1]![1]).toEqual([GROUP, 'op-1', 'illegal_content', null, 'm1/a.webp', new Date('2026-10-07T12:00:00Z')])
    expect(query.mock.calls[2]![0]).toMatch(/photo_url = null/)
    expect(query.mock.calls[2]![0]).toMatch(/photo_purged_at/)
  })

  it('refuses when the object is not the one on the Page', async () => {
    query.mockResolvedValueOnce({ rows: [removed], rowCount: 1 })
    await expect(reportPurge(operator, { ...input, objectPath: 'other/b.webp' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('"other" needs a note saying what happened', async () => {
    await expect(reportPurge(operator, { ...input, reasonCode: 'other' })).rejects.toThrow()
  })
})
