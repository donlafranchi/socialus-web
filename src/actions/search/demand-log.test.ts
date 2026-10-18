// #909 — search.demand_log: a settled Explore search is counted, anonymously, once per searcher per query per 10 minutes.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('../_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }) }))

import { searchDemandLog } from './demand-log'
import { demandKey } from '@/lib/search/demand'

const ME = '11111111-1111-1111-1111-111111111111'
const PLACE = '33333333-3333-3333-3333-333333333333'
const member = { actingMemberId: ME } as never
const anonymous = {
  get actingMemberId(): string {
    throw new Error('anonymous')
  },
} as never

let sharing: boolean | null = true
let fresh = true
beforeEach(() => {
  sharing = true
  fresh = true
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/select search_sharing/i.test(sql)) return { rows: sharing === null ? [] : [{ search_sharing: sharing }] }
    if (/delete from public\.search_demand_seen/i.test(sql)) return { rows: [], rowCount: 0 }
    if (/insert into public\.search_demand_seen/i.test(sql)) return { rows: fresh ? [{ key: 'k' }] : [], rowCount: fresh ? 1 : 0 }
    if (/insert into public\.search_demand /i.test(sql)) return { rows: [], rowCount: 1 }
    throw new Error('unexpected: ' + sql)
  })
})
const logged = () => query.mock.calls.find(([s]) => /insert into public\.search_demand /i.test(s))
const input = { query: '  Sourdough  Bread ', metroSlug: 'sacramento', placeId: PLACE, resultCount: 0, searcher: ME }

describe('search.demand_log', () => {
  it('logs the normalized text, the area and the result count, and no member id', async () => {
    expect(await searchDemandLog(member, input)).toEqual({ logged: true })
    const [sql, params] = logged()!
    expect(params).toEqual(['sourdough bread', 'sacramento', PLACE, 0])
    expect(sql).not.toMatch(/member/i)
    expect(JSON.stringify(params)).not.toContain(ME)
  })

  it('keys the 10-minute dedupe on a hash of searcher and query, never the id itself', async () => {
    await searchDemandLog(member, input)
    const [sql, params] = query.mock.calls.find(([s]) => /insert into public\.search_demand_seen/i.test(s))!
    expect(sql).toMatch(/on conflict/i)
    expect(params).toEqual([demandKey(ME, 'sourdough bread')])
    expect(query.mock.calls.some(([s]) => /delete from public\.search_demand_seen[\s\S]*10 minutes/i.test(s))).toBe(true)
  })

  it('a repeat inside 10 minutes is not logged again', async () => {
    fresh = false
    expect(await searchDemandLog(member, input)).toEqual({ logged: false })
    expect(logged()).toBeUndefined()
  })

  it('never logs a member who turned it off on You', async () => {
    sharing = false
    expect(await searchDemandLog(member, input)).toEqual({ logged: false })
    expect(logged()).toBeUndefined()
    expect(query.mock.calls.some(([s]) => /search_demand_seen/i.test(s))).toBe(false)
  })

  it('logs a signed-out search too, without asking about any member', async () => {
    expect(await searchDemandLog(anonymous, { ...input, searcher: 'browser-seed' })).toEqual({ logged: true })
    expect(query.mock.calls.some(([s]) => /search_sharing/i.test(s))).toBe(false)
  })

  it('reads nothing for a search under 2 characters or only contact details', async () => {
    for (const q of ['a', 'jo@example.com', '916-555-0123']) {
      expect(await searchDemandLog(member, { ...input, query: q })).toEqual({ logged: false })
    }
    expect(query).not.toHaveBeenCalled()
  })

  it('refuses a malformed input before reading anything', async () => {
    await expect(searchDemandLog(member, { ...input, resultCount: -1 })).rejects.toThrow()
    await expect(searchDemandLog(member, { ...input, placeId: 'nope' })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })
})
