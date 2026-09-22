// chore #199 — robots.txt.
//
// The list is the load-bearing part, so the tests are about the list: that it
// is not empty, that every name on it is refused everything, and that the
// private routes are closed to everyone including the search engines we do
// want. A future edit that quietly drops a crawler fails here.

import { describe, it, expect } from 'vitest'
import robots from './robots'
import { TRAINING_CRAWLERS, PRIVATE_PATHS } from './robots'

const rules = () => {
  const r = robots().rules
  return Array.isArray(r) ? r : [r]
}

const groupFor = (agent: string) =>
  rules().find((g) => {
    const a = g.userAgent
    return Array.isArray(a) ? a.includes(agent) : a === agent
  })

describe('robots.txt — the training crawlers', () => {
  it('names crawlers, and enough of them to be worth having', () => {
    expect(TRAINING_CRAWLERS.length).toBeGreaterThanOrEqual(20)
    expect(new Set(TRAINING_CRAWLERS).size).toBe(TRAINING_CRAWLERS.length)
  })

  it('refuses every named crawler the whole site', () => {
    for (const agent of TRAINING_CRAWLERS) {
      const group = groupFor(agent)
      expect(group, `no group for ${agent}`).toBeDefined()
      const disallow = group!.disallow
      expect(Array.isArray(disallow) ? disallow : [disallow]).toContain('/')
    }
  })

  it('gives a named crawler nothing back — no allow carve-out', () => {
    for (const agent of TRAINING_CRAWLERS) {
      expect(groupFor(agent)!.allow).toBeUndefined()
    }
  })

  // The ones that actually matter today, spelled out so a rename upstream is
  // caught by a failing test rather than by nobody.
  it.each(['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'Bytespider'])(
    'names %s',
    (agent) => {
      expect(TRAINING_CRAWLERS).toContain(agent)
    },
  )
})

describe('robots.txt — what everyone else may have', () => {
  const wildcard = () => groupFor('*')!

  it('lets a search engine index the site — being unfindable is not a privacy win', () => {
    expect(wildcard()).toBeDefined()
    expect(wildcard().allow).toContain('/')
  })

  it('closes the account, operator and API routes to everyone', () => {
    const disallow = wildcard().disallow as string[]
    for (const path of PRIVATE_PATHS) {
      expect(disallow).toContain(path)
    }
    expect(disallow).toEqual(expect.arrayContaining(['/you', '/manage/', '/admin/', '/api/', '/auth/']))
  })

  it('leaves the public surfaces open — that is the whole point of the split', () => {
    const disallow = wildcard().disallow as string[]
    for (const open of ['/explore', '/g/', '/m/', '/p/']) {
      expect(disallow).not.toContain(open)
    }
  })
})

describe('robots.txt — what it is not', () => {
  it('does not pretend to be enforcement', () => {
    // A named crawler that ignores this file is unaffected by it, and the
    // Supabase REST origin is not covered by it at all. Both are why the
    // firewall and the RLS question exist. Nothing here should ever grow a
    // comment claiming otherwise; this test is a marker, not a behaviour.
    expect(robots().rules).toBeDefined()
  })
})
