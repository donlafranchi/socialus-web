// F133 — usage is counted on the server, after the response, for a signed-in member only.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const { usageLog, after, viewer } = vi.hoisted(() => ({
  usageLog: vi.fn(async () => ({ counted: true })),
  after: vi.fn((fn: () => unknown) => void fn()),
  viewer: vi.fn(async (): Promise<string | null> => null),
}))
vi.mock('next/server', () => ({ after }))
vi.mock('@/actions', () => ({ usageLog }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/auth/viewer', () => ({ viewerId: viewer }))

import { countUse, partForPage, partsForExplore } from './count-use'

beforeEach(() => vi.clearAllMocks())

describe('countUse', () => {
  it('counts nothing for a stranger', async () => {
    await countUse({ part: 'explore' })
    await countUse({ part: 'explore' }, null)
    expect(usageLog).not.toHaveBeenCalled()
  })

  it('reads the session when the caller does not know the member, and defers the write with after()', async () => {
    viewer.mockResolvedValueOnce('m-1')
    await countUse({ part: 'pages' })
    expect(after).toHaveBeenCalledTimes(1)
    expect(usageLog).toHaveBeenCalledWith(expect.objectContaining({ actingMemberId: 'm-1' }), { part: 'pages' })
  })

  it('sends a member and part once a day from one server, however many pages they open', async () => {
    for (let i = 0; i < 5; i++) await countUse({ part: 'map' }, 'm-2')
    await countUse({ part: 'search' }, 'm-2')
    await countUse({ step: 'first_follow' }, 'm-2')
    expect(usageLog).toHaveBeenCalledTimes(3)
  })

  it('never throws, even when the count fails', async () => {
    usageLog.mockRejectedValueOnce(new Error('pool exhausted'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(countUse({ part: 'posts' }, 'm-3')).resolves.toBeUndefined()
    err.mockRestore()
  })
})

describe('which part', () => {
  it('a post on a Page is posts; a business Page is pages; any other Page is groups', () => {
    expect(partForPage('business', true)).toBe('posts')
    expect(partForPage('business', false)).toBe('pages')
    expect(partForPage('group', false)).toBe('groups')
  })
  it('Explore is the map, a search, or Explore itself', () => {
    expect(partsForExplore({ view: 'map', q: 'x' })).toEqual(['map'])
    expect(partsForExplore({ q: ' tacos ' })).toEqual(['search'])
    expect(partsForExplore({ category: 'food' })).toEqual(['search'])
    expect(partsForExplore({ q: '  ' })).toEqual(['explore'])
  })
})

// No client script and no outside service: nothing that runs in the browser reaches the counting code, and the
// counting code calls nothing but our own database.
const SRC = join(__dirname, '..', '..')
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}
describe('F133.5 — nothing leaves, nothing added to the page', () => {
  // [guards F133.5]
  it('no client file imports the counting code, and the counting code sends nothing outside', () => {
    const client = files(SRC).filter((p) => /^\s*['"]use client['"]/.test(readFileSync(p, 'utf8')))
    const reaching = client.filter((p) => /from ['"](@\/lib\/usage|@\/actions\/usage)[/'"]|usageLog/.test(readFileSync(p, 'utf8')))
    expect(reaching).toEqual([])
    for (const f of ['lib/usage/count-use.ts', 'actions/usage/log.ts']) {
      expect(readFileSync(join(SRC, f), 'utf8')).not.toMatch(/fetch\(|https?:\/\/|XMLHttpRequest|sendBeacon/)
    }
  })
})
