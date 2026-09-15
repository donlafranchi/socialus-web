import { describe, it, expect } from 'vitest'
import { PURPOSES, PURPOSE_COPY, nounFor } from './purpose'

// F087 (draft) — the words follow the answer.

describe('the purpose set', () => {
  it('is exactly the three Don named', () => {
    expect([...PURPOSES]).toEqual(['shop', 'service', 'group'])
  })

  it('carries his phrasing for each choice', () => {
    expect(PURPOSE_COPY.shop.choice).toBe('Opening a shop')
    expect(PURPOSE_COPY.service.choice).toBe('Offering a service')
    expect(PURPOSE_COPY.group.choice).toBe('Creating a group for meetups')
  })

  it('has no fourth option — a one-time gathering is not ruled on', () => {
    // F087's story mentions hosting a gathering; Don's three do not include
    // it, and inventing it here would be deciding something he has not.
    expect(PURPOSES).toHaveLength(3)
  })
})

describe('the noun that replaces "shop"', () => {
  it('differs per purpose, which is the whole point', () => {
    expect(nounFor('shop')).toBe('shop')
    expect(nounFor('service')).toBe('service')
    expect(nounFor('group')).toBe('group')
    expect(new Set(PURPOSES.map(nounFor)).size).toBe(3)
  })

  it('falls back to shop for a draft started before the question existed', () => {
    expect(nounFor(null)).toBe('shop')
  })
})

describe('voice.md mechanics', () => {
  const strings = Object.values(PURPOSE_COPY).flatMap((c) => [c.choice, c.noun])

  it('uses no em dash', () => {
    for (const s of strings) expect(s).not.toContain('—')
  })

  it('never names a person as a category', () => {
    const banned = /\b(vendor|producer|seller|maker|supporter|consumer|patron|creator)s?\b/i
    for (const s of strings) expect(s).not.toMatch(banned)
  })

  it('never shows the person the word Page', () => {
    // Don ruled it: Page is what the docs and the code call it, not the person.
    for (const s of strings) expect(s.toLowerCase()).not.toContain('page')
  })
})
