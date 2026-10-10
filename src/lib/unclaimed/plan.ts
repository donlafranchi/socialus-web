// #517 — which of the researched Sacramento makers become unclaimed Pages, in
// what order, and what each one says. Pure: scripts/unclaimed/load.ts writes it.
import { toSlug } from '../slugify'

export interface MakerRow {
  name: string
  category: string
  makes: string
  area: string
  site: string
  confidence: string
}

export type SkipReason = 'personal-care' | 'no-site'

/** A row of scripts/unclaimed/listings.json (the first researched listings; one more field set than a maker row). */
export interface ListingRow {
  key: string
  name: string
  purpose: 'sell' | 'service' | 'creative' | 'gather'
  town: string
  neighbourhood?: string | null
  website: string
  social?: Partial<Record<'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube', string>>
  description: string
  sources?: { field: string; url: string }[]
}

export interface PlannedPage {
  name: string
  slug: string
  description: string
  publicInfoUrl: string
  /** Where a link fix moved it from: the address an existing Page was filed under. */
  legacyUrl?: string
  city: string
  /** From "Town (County)"; the place to fall back on when the town is not in `places`. */
  county?: string
  purpose: 'sell' | 'offer' | 'create' | 'gather'
  /** The stock-photo pool and sample-post voice for this kind of business (src/lib/unclaimed/stock.ts). */
  pool: string
  /** Shown beside the town in a sample post ("Midtown", "Davis"). */
  area: string
  social?: Partial<Record<'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube', string>>
  sources: { field: 'name' | 'description' | 'website' | 'address'; url: string }[]
}

export const CLAIM_LINE = 'Claim this Page to tell your own story.'

const PERSONAL_CARE = /\b(salon|barber|nail|spa|hair|beauty|lash|wax)\b/i
const NONPROFIT_OR_GALLERY = /nonprofit|gallery|center for the arts|tool library|association|co-?op\b|potters group/i
const RANK = (c: string) => (/^High/i.test(c) ? 0 : /^Medium-high/i.test(c) ? 1 : 2)

const https = (u: string) => u.replace(/^http:\/\//i, 'https://')
/** "Placerville (El Dorado)" is a town and its county; "Midtown Sacramento", "Sacramento/Arden" are Sacramento. */
function placeOf(area: string): { city: string; county?: string } {
  const m = area.trim().match(/^(.+?)\s*\(([^)]+)\)$/)
  const town = (m ? m[1]! : area).split('/')[0]!.trim()
  if (m && m[2]!.trim().toLowerCase() !== 'sacramento') return { city: town, county: m[2]!.trim() }
  if (m) return { city: town.toLowerCase() === 'sacramento' ? 'Sacramento' : town, county: 'Sacramento' }
  return { city: /\b(west sacramento)\b/i.test(area) ? 'West Sacramento' : /\b(folsom|granite bay|clarksburg|elk grove|carmichael)\b/i.test(area) ? area.match(/folsom|granite bay|clarksburg|elk grove|carmichael/i)![0].replace(/\b\w/g, (c) => c.toUpperCase()) : 'Sacramento' }
}

/** A short stable tag from the site, so a re-run finds the same Page. */
function tag(s: string): string {
  let h = 5381
  for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0
  return h.toString(36).padStart(6, '0').slice(0, 6)
}

function describe(row: MakerRow): string {
  const what = row.makes.trim().replace(/\.$/, '')
  const lower = what.charAt(0).toLowerCase() + what.slice(1)
  return `${row.name}: ${lower}, in ${row.area.trim()}. ${CLAIM_LINE}`
}

const POOL_BY_CATEGORY: [RegExp, string][] = [
  [/farm stay|agritourism/i, 'Farm stay & agritourism'],
  [/ranch/i, 'Ranch'],
  [/^farm/i, 'Farm'],
  [/cake|bakery/i, 'Cakes & bakery'],
  [/food|drink/i, 'Food & drink'],
  [/repair|trade/i, 'Repair & trades'],
  [/art|print/i, 'Art & print'],
  [/goods|craft/i, 'Goods & crafts'],
]
export const poolFor = (category: string): string => POOL_BY_CATEGORY.find(([re]) => re.test(category))?.[1] ?? 'Local business'

/** Listings carry no category: read the pool from what the business says it is. */
const POOL_BY_WORDS: [RegExp, string][] = [
  [/farmers.? market|grocery|co-?op\b|produce|harvest/i, 'Farm'],
  [/book|shop\b|store\b/i, 'Local business'],
  [/brew|alehouse|coffee|cafe|café|tea|grocery|food|market|kitchen|restaurant|deli|pizza|taproom|winery|wine/i, 'Food & drink'],
  [/bake|bread|cake|pastr/i, 'Cakes & bakery'],
  [/bike|bicycle|repair|sewing|vacuum|tool|hardware|auto|plumb|electric/i, 'Repair & trades'],
  [/art|gallery|print|studio|theat|music|craft|book|creative/i, 'Art & print'],
  [/farm|ranch|orchard|nursery|garden/i, 'Farm'],
]
const poolForListing = (r: ListingRow) => POOL_BY_WORDS.find(([re]) => re.test(`${r.name} ${r.description}`))?.[1] ?? 'Local business'

const LISTING_PURPOSE: Record<ListingRow['purpose'], PlannedPage['purpose']> = { sell: 'sell', service: 'offer', creative: 'create', gather: 'gather' }

export function planListings(rows: ListingRow[]): PlannedPage[] {
  return rows.map((row): PlannedPage => {
    const url = https(row.website.trim())
    const description = row.description.includes(CLAIM_LINE) ? row.description : `${row.description.trim()} ${CLAIM_LINE}`
    return {
      name: row.name,
      slug: `${toSlug(row.name)}-${tag(url)}`,
      description,
      publicInfoUrl: url,
      city: row.town,
      purpose: LISTING_PURPOSE[row.purpose],
      pool: poolForListing(row),
      area: row.neighbourhood?.trim() || row.town,
      ...(row.social && Object.keys(row.social).length ? { social: row.social } : {}),
      sources: (['name', 'description', 'website', 'address'] as const).map((field) => ({ field, url })),
    }
  })
}

export function planMakers(rows: MakerRow[]): { listed: PlannedPage[]; skipped: { name: string; reason: SkipReason }[] } {
  const skipped: { name: string; reason: SkipReason }[] = []
  const keep: { row: MakerRow; rank: number; nonprofit: boolean }[] = []
  for (const row of rows) {
    // Every shop goes in (Don, 2026-10-09). Only a salon (not a maker) or a row with no site is left out.
    const reason: SkipReason | null = PERSONAL_CARE.test(`${row.name} ${row.makes}`) ? 'personal-care' : !/^https?:\/\//i.test(row.site) ? 'no-site' : null
    if (reason) skipped.push({ name: row.name, reason })
    else keep.push({ row, rank: RANK(row.confidence), nonprofit: NONPROFIT_OR_GALLERY.test(`${row.name} ${row.makes} ${row.confidence}`) })
  }
  keep.sort((a, b) => Number(a.nonprofit) - Number(b.nonprofit) || a.rank - b.rank)
  const listed = keep.map(({ row }): PlannedPage => {
    const url = https(row.site.trim())
    return {
      name: row.name,
      slug: `${toSlug(row.name)}-${tag(url)}`,
      description: describe(row),
      publicInfoUrl: url,
      ...placeOf(row.area),
      purpose: /repair|stay|agritourism/i.test(row.category) ? 'offer' : 'sell',
      pool: poolFor(row.category),
      area: row.area.trim().split('/')[0]!.replace(/\s*\(.*\)$/, '').trim() || placeOf(row.area).city,
      sources: (['name', 'description', 'website', 'address'] as const).map((field) => ({ field, url })),
    }
  })
  return { listed, skipped }
}
