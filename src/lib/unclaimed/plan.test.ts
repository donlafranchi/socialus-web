import { describe, it, expect } from 'vitest'
import { planMakers, CLAIM_LINE, type MakerRow } from './plan'
import rows from '../../../scripts/unclaimed/makers.json'

const r = (o: Partial<MakerRow> = {}): MakerRow => ({ name: 'Temple Coffee Roasters', category: 'Food & drink', makes: 'Coffee roaster, subscriptions', area: 'Midtown/Downtown', site: 'https://templecoffee.com/', confidence: 'Medium-high', ...o })

describe('planMakers (#517)', () => {
  it('lists every researched row, including the ten Don is visiting and the ones marked HOLD (Don, 2026-10-09: every shop goes in)', () => {
    const p = planMakers(rows as MakerRow[])
    expect(p.listed).toHaveLength(52)
    expect(p.skipped).toEqual([])
    for (const name of ['Real Pie Company', 'Myrtle Press', 'Camellia Coffee Roasters', 'I Street Art Studios']) {
      expect(p.listed.some((x) => x.name === name), name).toBe(true)
    }
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
  it('reads "Town (County)": the town, and the county to fall back on', () => {
    const a = planMakers([r({ area: 'Placerville (El Dorado)' })]).listed[0]!
    expect([a.city, a.county]).toEqual(['Placerville', 'El Dorado'])
    const b = planMakers([r({ area: 'Capay Valley (Yolo)' })]).listed[0]!
    expect([b.city, b.county]).toEqual(['Capay Valley', 'Yolo'])
    const c = planMakers([r({ area: 'Woodland/Davis (Yolo)' })]).listed[0]!
    expect([c.city, c.county]).toEqual(['Woodland', 'Yolo'])
    const d = planMakers([r({ area: 'Downtown Sacramento' })]).listed[0]!
    expect([d.city, d.county]).toEqual(['Sacramento', undefined])
    expect(planMakers([r({ area: 'Sacramento/Arden/Roseville' })]).listed[0]!.city).toBe('Sacramento')
  })
  it('a stay, a farm visit or a pumpkin patch is an offer; a farm, ranch or bakery is a shop', () => {
    expect(planMakers([r({ category: 'Farm stay & agritourism' })]).listed[0]!.purpose).toBe('offer')
    expect(planMakers([r({ category: 'Farm' })]).listed[0]!.purpose).toBe('sell')
    expect(planMakers([r({ category: 'Cakes & bakery' })]).listed[0]!.purpose).toBe('sell')
  })
  it('puts a Page in its own city, defaulting to Sacramento', () => {
    expect(planMakers([r({ area: 'West Sacramento' })]).listed[0]!.city).toBe('West Sacramento')
    expect(planMakers([r({ area: 'Granite Bay' })]).listed[0]!.city).toBe('Granite Bay')
    expect(planMakers([r({ area: 'Midtown' })]).listed[0]!.city).toBe('Sacramento')
  })
  it('lists a real, never-before-counted set from the researched file (no duplicates, https only)', () => {
    const p = planMakers(rows as MakerRow[])
    expect(p.listed.length).toBe(52)
    expect(new Set(p.listed.map((x) => x.slug)).size).toBe(p.listed.length)
    expect(p.listed.every((x) => x.publicInfoUrl.startsWith('https://'))).toBe(true)
  })
})

describe('every planned Page can be given pictures (#556)', () => {
  it('has a stock pool with enough pictures behind it, so a business whose own site gives none still gets a cover and a gallery', async () => {
    const { readPlanned } = await import('../../../scripts/unclaimed/rows')
    const { stockPools } = await import('./photos')
    const { listed } = readPlanned()
    expect(listed.length).toBeGreaterThan(100)
    for (const p of listed) {
      expect(stockPools[p.pool], `${p.name}: pool ${p.pool}`).toBeDefined()
      expect(stockPools[p.pool]!.length).toBeGreaterThanOrEqual(8)
    }
  })
  it('files every Page under an https address', async () => {
    const { readPlanned } = await import('../../../scripts/unclaimed/rows')
    for (const p of readPlanned().listed) expect(p.publicInfoUrl, p.name).toMatch(/^https:\/\//)
  })
})
