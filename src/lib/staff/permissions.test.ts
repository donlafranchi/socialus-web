import { describe, it, expect, vi } from 'vitest'
import { PERMISSIONS, staffCan, permissionsOf } from './permissions'

const OWNER = 'owner-member'
const env = { OPERATOR_MEMBER_ID: OWNER }
const db = (rows: Record<string, unknown>[]) => ({ query: vi.fn(async () => ({ rows })) })

describe('staffCan (#544)', () => {
  it('the bootstrap owner (OPERATOR_MEMBER_ID) holds every permission without touching the database', async () => {
    const d = db([])
    for (const p of PERMISSIONS) expect(await staffCan(d, OWNER, p, env), p).toBe(true)
    expect(d.query).not.toHaveBeenCalled()
  })
  it('anyone else is decided by the database, and only an explicit true counts', async () => {
    expect(await staffCan(db([{ ok: true }]), 'm1', 'metrics.view', env)).toBe(true)
    expect(await staffCan(db([{ ok: false }]), 'm1', 'metrics.view', env)).toBe(false)
    expect(await staffCan(db([]), 'm1', 'metrics.view', env)).toBe(false)
    expect(await staffCan(db([{ something: 'else' }]), 'm1', 'metrics.view', env)).toBe(false)
  })
  it('asks about that member and that permission', async () => {
    const d = db([{ ok: true }])
    await staffCan(d, 'm1', 'tags.review', env)
    expect(d.query).toHaveBeenCalledWith(expect.stringMatching(/staff_assignments/), ['m1', 'tags.review'])
  })
  it('no member, the bootstrap placeholder, or a permission nobody defined: false, no query', async () => {
    const d = db([{ ok: true }])
    expect(await staffCan(d, null, 'metrics.view', env)).toBe(false)
    expect(await staffCan(d, 'self-bootstrap', 'metrics.view', env)).toBe(false)
    expect(await staffCan(d, 'm1', 'nothing.at.all' as never, env)).toBe(false)
    expect(d.query).not.toHaveBeenCalled()
  })
  it('a database error denies rather than allows', async () => {
    const d = { query: vi.fn(async () => { throw new Error('down') }) }
    expect(await staffCan(d, 'm1', 'metrics.view', env)).toBe(false)
  })
  it('permissionsOf: the owner has all of them; others get what the database lists, filtered to known ones', async () => {
    expect(await permissionsOf(db([]), OWNER, env)).toEqual([...PERMISSIONS])
    expect(await permissionsOf(db([{ permission: 'metrics.view' }, { permission: 'made.up' }]), 'm1', env)).toEqual(['metrics.view'])
    expect(await permissionsOf(db([]), null, env)).toEqual([])
  })
})
