import { describe, it, expect } from 'vitest'
import { planMakers, HELD_OUT, CLAIM_LINE, type MakerRow } from './plan'
import rows from '../../../scripts/unclaimed/makers.json'

const r = (o: Partial<MakerRow> = {}): MakerRow => ({ name: 'Temple Coffee Roasters', category: 'Food & drink', makes: 'Coffee roaster, subscriptions', area: 'Midtown/Downtown', site: 'https://templecoffee.com/', confidence: 'Medium-high', ...o })

describe('planMakers (#517)', () => {
  it('holds out the ten businesses Don is visiting in person', () => {
    expect(HELD_OUT).toHaveLength(10)
    const p = planMakers(rows as MakerRow[])
    for (const name of HELD_OUT) {
      expect(p.listed.some((x) => x.name.toLowerCase().includes(name.toLowerCase())), name).toBe(false)
      expect(p.skipped.some((x) => x.name.toLowerCase().includes(name.toLowerCase()) && x.reason === 'held-out'), name).toBe(true)
    }
  })
  it('holds the rows the research marked HOLD or Low-medium, and a row with no own site', () => {
    const p = planMakers([r({ name: 'A', confidence: 'Low-medium (HOLD): nothing dated' }), r({ name: 'B', confidence: 'High; no own site (Midtown Association page)' }), r({ name: 'C', confidence: 'High' })])
    expect(p.listed.map((x) => x.name)).toEqual(['C'])
    expect(p.skipped.map((x) => `${x.name}:${x.reason}`)).toEqual(['A:held', 'B:no-own-site'])
  })
  it('skips personal-care salons', () => {
    const p = planMakers([r({ name: 'Glow Nail Salon', makes: 'Nails', category: 'Goods & crafts' })])
    expect(p.listed).toEqual([])
    expect(p.skipped[0]!.reason).toBe('personal-care')
  })
  it('orders High, then Medium-high, then Medium, for-profit makers before nonprofits and galleries', () => {
    const p = planMakers([
      r({ name: 'M', confidence: 'Medium' }),
      r({ name: 'H nonprofit', confidence: 'High; nonprofit' }),
      r({ name: 'MH', confidence: 'Medium-high' }),
      r({ name: 'H', confidence: 'High' }),
    ])
    expect(p.listed.map((x) => x.name)).toEqual(['H', 'MH', 'M', 'H nonprofit'])
  })
  it('writes a description in our own words that ends with the claim line, with no email', () => {
    const [x] = planMakers([r()]).listed
    expect(x!.description.endsWith(CLAIM_LINE)).toBe(true)
    expect(CLAIM_LINE).toBe('Claim this Page to tell your own story.')
    expect(x!.description).toContain('Temple Coffee Roasters')
    expect(x!.description).not.toMatch(/@/)
  })
  it('keys each Page on its own site, deterministically, and puts it in the source log', () => {
    const a = planMakers([r()]).listed[0]!
    const b = planMakers([r()]).listed[0]!
    expect(a.slug).toBe(b.slug)
    expect(a.publicInfoUrl).toBe('https://templecoffee.com/')
    expect(a.sources.map((s) => s.field).sort()).toEqual(['address', 'description', 'name', 'website'])
    expect(a.sources.every((s) => s.url === 'https://templecoffee.com/')).toBe(true)
  })
  it('puts a Page in its own city, defaulting to Sacramento', () => {
    expect(planMakers([r({ area: 'West Sacramento' })]).listed[0]!.city).toBe('West Sacramento')
    expect(planMakers([r({ area: 'Granite Bay' })]).listed[0]!.city).toBe('Granite Bay')
    expect(planMakers([r({ area: 'Midtown' })]).listed[0]!.city).toBe('Sacramento')
  })
  it('lists a real, never-before-counted set from the researched file (no duplicates, https only)', () => {
    const p = planMakers(rows as MakerRow[])
    expect(p.listed.length).toBeGreaterThan(25)
    expect(new Set(p.listed.map((x) => x.slug)).size).toBe(p.listed.length)
    expect(p.listed.every((x) => x.publicInfoUrl.startsWith('https://'))).toBe(true)
  })
})
