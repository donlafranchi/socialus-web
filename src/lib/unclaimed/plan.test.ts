import { describe, it, expect } from 'vitest'
import { planMakers, planListings, batchCoverage, CLAIM_LINE, type MakerRow } from './plan'
import { INTEREST_VOCAB } from '@/lib/onboarding/interest-vocab'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  it('a food bank, volunteer group, club or nonprofit gathers people and gets the community pool, never a shop (#786)', () => {
    for (const category of ['Food bank (nonprofit)', 'Meal program (nonprofit)', 'Volunteer building and ReStore (nonprofit)', 'Service club', 'Animal rescue', 'Friends of the library']) {
      const [x] = planMakers([r({ category })]).listed
      expect([x!.pool, x!.purpose], category).toEqual(['Community & volunteer', 'gather'])
    }
    for (const category of ['Food & drink', 'Farm', 'Ranch', 'Cakes & bakery', 'Repair & trades', 'Art & print', 'Goods & crafts']) {
      expect(planMakers([r({ category })]).listed[0]!.pool, category).not.toBe('Community & volunteer')
    }
  })
  it('an arts or history group gathers people and gets arts pictures, not the food-bank ones (#786)', () => {
    for (const category of ['Art association (nonprofit)', 'Historical society', 'Small museum and makerspace (nonprofit)', 'Community band (nonprofit)', 'Community theatre', 'Choir']) {
      const [x] = planMakers([r({ category })]).listed
      expect([x!.pool, x!.purpose], category).toEqual(['Arts & culture', 'gather'])
    }
    expect(planMakers([r({ category: 'Art & print' })]).listed[0]!.pool).toBe('Art & print')
    expect(planMakers([r({ category: 'Food bank (nonprofit)' })]).listed[0]!.pool).toBe('Community & volunteer')
  })
  it('a conservancy, land trust, trail group or garden gathers people and gets outdoor pictures; a nursery is a grower (#786)', () => {
    for (const category of ['Creek conservancy (nonprofit)', 'Land trust (nonprofit)', 'Nature center (nonprofit)', 'Trail group (nonprofit)', 'Demonstration garden (nonprofit)', 'Community garden']) {
      const [x] = planMakers([r({ category })]).listed
      expect([x!.pool, x!.purpose], category).toEqual(['Green & outdoors', 'gather'])
    }
    expect(planMakers([r({ category: 'Nursery' })]).listed[0]!.pool).toBe('Farm')
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

// #816 a2 (cap-3, cap-4) — every unclaimed Page carries 1–2 of the 12 interest tags, by what it is.
describe('a2 — interest tags', () => {
  const labels = new Set(INTEREST_VOCAB.map((t) => t.label))
  it('every planned Page, maker or listing, has 1 or 2 interest tags from the vocabulary', async () => {
    const { readPlanned } = await import('../../../scripts/unclaimed/rows')
    const { listed } = readPlanned()
    for (const p of listed) {
      expect(p.interests.length, p.name).toBeGreaterThanOrEqual(1)
      expect(p.interests.length, p.name).toBeLessThanOrEqual(2)
      for (const t of p.interests) expect(labels.has(t), `${p.name}: ${t}`).toBe(true)
    }
  })
  it('reads them from what the Page is', () => {
    const one = (category: string) => planMakers([r({ category })]).listed[0]!.interests
    expect(one('Farm')).toContain('Farmers markets')
    expect(one('Food bank (nonprofit)')).toContain('Volunteering')
    expect(one('Community band (nonprofit)')).toContain('Live music')
    expect(one('Demonstration garden (nonprofit)')).toContain('Gardening')
    expect(one('Trail group (nonprofit)')).toContain('Fitness & outdoors')
    expect(one('Goods & crafts')).toContain('Crafts & makers')
    expect(planListings([{ key: 'k', name: 'Davis Farmers Market', purpose: 'sell', town: 'Davis', website: 'https://davisfarmersmarket.org/', description: 'A market.' }])[0]!.interests).toContain('Farmers markets')
  })
})

// #816 a3 (cap-2) — each day's batch covers at least 5 towns and at least 4 interest tags.
describe('a3 — batch coverage', () => {
  it('counts towns and interest tags across a batch', () => {
    const rows = ['Davis (Yolo)', 'Woodland (Yolo)', 'Auburn (Placer)', 'Folsom (Sacramento)', 'Rocklin (Placer)'].map((area, i) =>
      r({ name: `P${i}`, site: `https://p${i}.example/`, area, category: ['Farm', 'Food bank (nonprofit)', 'Goods & crafts', 'Historical society', 'Trail group (nonprofit)'][i]! }),
    )
    const c = batchCoverage(rows)
    expect(c.towns).toBe(5)
    expect(c.interests).toBeGreaterThanOrEqual(4)
    expect(c.ok).toBe(true)
    expect(batchCoverage(rows.slice(0, 2)).ok).toBe(false)
  })
  it('every daily batch from 2026-10-17 on meets it', () => {
    const dir = join(__dirname, '../../../scripts/unclaimed')
    for (const f of readdirSync(dir).filter((f) => /^makers-\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(7, 17) >= '2026-10-17')) {
      expect(batchCoverage(JSON.parse(readFileSync(join(dir, f), 'utf8'))).ok, f).toBe(true)
    }
  })
})

