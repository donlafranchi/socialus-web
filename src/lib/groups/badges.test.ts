// #371 — badges, launch scope (ruled 2026-10-05): the kind facts, each the
// owner's claim ("Says …"); Locally owned from the registration, businesses only.
import { describe, it, expect } from 'vitest'
import { parseBadges, pageBadges, offeredBadges } from './badges'

describe('parseBadges', () => {
  it('keeps only known facts, and a plausible year', () => {
    expect(parseBadges({ badges: { family_owned: true, since: 1998, coop: 'yes', bogus: true } })).toEqual({ family_owned: true, since: 1998 })
    expect(parseBadges({ badges: { since: 3000 } })).toEqual({})
    expect(parseBadges(null)).toEqual({})
  })
})

describe('pageBadges', () => {
  it('Locally owned first, for a business with a matching registration', () => {
    const got = pageBadges('business', { family_owned: true }, true)
    expect(got.map((b) => b.label)).toEqual(['Locally owned', 'Family-owned'])
    expect(got[0]!.says).toBe('Says locally owned')
    expect(got[0]!.source).toBe('registration')
  })
  it('never Locally owned on a social group, even if the registration matches', () => {
    expect(pageBadges('interest', {}, true)).toEqual([])
  })
  it('Since reads as meeting since for a social group', () => {
    expect(pageBadges('interest', { since: 2019 }, false)[0]!.label).toBe('Meeting since 2019')
    expect(pageBadges('business', { since: 1998 }, false)[0]!.label).toBe('Since 1998')
  })
  it('every claim says so', () => {
    for (const b of pageBadges('business', { coop: true, nonprofit: true, free_to_join: true, everyone_welcome: true }, false)) {
      expect(b.says).toMatch(/^Says /)
      expect(b.source).toBe('owner')
    }
  })
})

describe('offeredBadges', () => {
  it('lists the ones that fit the type first, the rest after, and no Locally owned to pick', () => {
    expect(offeredBadges('business').first).toEqual(['family_owned', 'since', 'coop', 'everyone_welcome'])
    expect(offeredBadges('interest').first).toEqual(['since', 'free_to_join', 'everyone_welcome'])
    expect([...offeredBadges('interest').first, ...offeredBadges('interest').more]).not.toContain('locally_owned')
  })
})
