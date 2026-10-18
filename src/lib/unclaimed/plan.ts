// #517 — which of the researched Sacramento makers become unclaimed Pages, in
// what order, and what each one says. Pure: scripts/unclaimed/load.ts writes it.
import { toSlug } from '../slugify'
import { streetAddressOf } from './address'

export interface MakerRow {
  name: string
  category: string
  makes: string
  area: string
  site: string
  confidence: string
  /** #936 — its street address, when the row gives one outright. */
  address?: string | null
  /** TikTok and Instagram first: the profiles its own site links (Don, 2026-10-16). Links only. */
  social?: Partial<Record<'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube', string>>
  /** #909 — 3–6 things it sells or offers, each from a page on its own site. Price in dollars, optional. */
  products?: { name: string; url: string; price?: number; kind?: 'product' | 'service' }[]
}

export type SkipReason = 'personal-care' | 'no-site'

/** A row of scripts/unclaimed/listings.json (the first researched listings; one more field set than a maker row). */
export interface ListingRow {
  key: string
  name: string
  purpose: 'sell' | 'service' | 'creative' | 'gather'
  town: string
  neighbourhood?: string | null
  address?: string | null
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
  /** #816 a2 (cap-3, cap-4) — 1–2 of the 12 interest labels (src/lib/onboarding/interest-vocab.ts), on the Page and its samples. */
  interests: string[]
  social?: Partial<Record<'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube', string>>
  sources: { field: 'name' | 'description' | 'website' | 'address'; url: string }[]
  /** #936 — its street address, where its row names one: the Page is pinned there, not at its town. */
  address?: string
  /** #909 — sample products and services from its own site; the Page shows them labelled Sample, credited. */
  products?: SampleProduct[]
}

export interface SampleProduct {
  name: string
  url: string
  priceCents: number | null
  kind: 'product' | 'service'
}

export const SAMPLE_PRODUCTS_MIN = 3
export const SAMPLE_PRODUCTS_MAX = 6
/** Marketplaces and directories: a lead source at most, never what a sample is copied from (#353, Don 2026-10-16). */
const MARKETPLACE = /(^|\.)(etsy|amazon|ebay|facebook|instagram|tiktok|yelp|google|nextdoor|craigslist|faire|walmart|target|shopify)\.com$/i

const hostOf = (u: string): string | null => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/** #909 — the row's products that come from its own site, 3 to 6 of them, or none. */
export function sampleProductsFor(site: string, products: MakerRow['products'] = []): SampleProduct[] {
  const own = hostOf(site)
  if (!own || MARKETPLACE.test(own)) return []
  const kept = products
    .filter((p) => p.name?.trim() && (hostOf(p.url) === own || hostOf(p.url)?.endsWith(`.${own}`)) && /^https:\/\//i.test(p.url))
    .slice(0, SAMPLE_PRODUCTS_MAX)
    .map((p) => ({
      name: p.name.trim().slice(0, 80),
      url: p.url,
      priceCents: typeof p.price === 'number' && p.price >= 0 ? Math.round(p.price * 100) : null,
      kind: p.kind ?? 'product',
    }))
  return kept.length >= SAMPLE_PRODUCTS_MIN ? kept : []
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

/** #786 — volunteer groups, nonprofits and clubs: they gather people, they don't sell. Before "food" so a food bank lands here. */
export const COMMUNITY = 'Community & volunteer'
const COMMUNITY_CATEGORY = /volunteer|nonprofit|food bank|pantry|mutual aid|meal program|community|club|society|library|league|rescue|shelter|association|collective/i

/** Arts, music and history groups: they gather people too, with pictures of galleries, stages and museums. */
export const ARTS = 'Arts & culture'
const ARTS_CATEGORY = /museum|band|choir|chorale|chorus|orchestra|symphony|theat|histor|gallery|music|dance|makerspace|art (association|collective|center|centre|council|league|society|guild)/i

/** Conservancies, land trusts, trail groups and gardens: they gather people, with pictures of trails, creeks and gardens. */
export const GREEN = 'Green & outdoors'
const GREEN_CATEGORY = /conservanc|land trust|nature|trail|garden|creek|river|watershed|native plant|park/i

const POOL_BY_CATEGORY: [RegExp, string][] = [
  [GREEN_CATEGORY, GREEN],
  [/nursery/i, 'Farm'],
  [ARTS_CATEGORY, ARTS],
  [COMMUNITY_CATEGORY, COMMUNITY],
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

/** #816 a2 — what kind of Page it is decides its interests: 1 or 2 of the 12 labels, never more. */
const INTERESTS_BY_POOL: Record<string, string[]> = {
  Farm: ['Farmers markets', 'Sustainability'],
  Ranch: ['Farmers markets', 'Food & drink'],
  'Farm stay & agritourism': ['Farmers markets', 'Neighborhood life'],
  'Food & drink': ['Food & drink', 'Local business'],
  'Cakes & bakery': ['Food & drink', 'Local business'],
  'Goods & crafts': ['Crafts & makers', 'Local business'],
  'Art & print': ['Arts & culture', 'Crafts & makers'],
  'Repair & trades': ['Local business', 'Sustainability'],
  'Community & volunteer': ['Volunteering', 'Neighborhood life'],
  'Arts & culture': ['Arts & culture', 'Neighborhood life'],
  'Green & outdoors': ['Fitness & outdoors', 'Sustainability'],
  'Local business': ['Local business'],
}
export function interestsFor(pool: string, what: string): string[] {
  const base = INTERESTS_BY_POOL[pool] ?? ['Local business']
  if (/band|music|choir|chorale|chorus|orchestra|symphony/i.test(what)) return ['Live music', 'Arts & culture']
  if (/garden|nursery|plant/i.test(what)) return ['Gardening', 'Sustainability']
  if (/farmers.? market/i.test(what)) return ['Farmers markets', 'Food & drink']
  return base
}

/** #816 a3 (cap-2) — a batch of 8 or more Pages spans at least 5 towns and 4 interest tags; a smaller one loads what qualifies (Don, 2026-10-18). */
export const BATCH_SPREAD_FROM = 8
export const BATCH_MIN_TOWNS = 5
export const BATCH_MIN_INTERESTS = 4
export function batchCoverage(rows: MakerRow[]): { towns: number; interests: number; ok: boolean } {
  const { listed } = planMakers(rows)
  const towns = new Set(listed.map((p) => p.city)).size
  const interests = new Set(listed.flatMap((p) => p.interests)).size
  return { towns, interests, ok: listed.length < BATCH_SPREAD_FROM || (towns >= BATCH_MIN_TOWNS && interests >= BATCH_MIN_INTERESTS) }
}

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
      interests: interestsFor(poolForListing(row), `${row.name} ${row.description}`),
      area: row.neighbourhood?.trim() || row.town,
      ...(row.address?.trim() ? { address: row.address.trim() } : {}),
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
    const address = streetAddressOf({ city: placeOf(row.area).city, text: `${row.makes} ${row.confidence}`, address: row.address })
    return {
      name: row.name,
      slug: `${toSlug(row.name)}-${tag(url)}`,
      description: describe(row),
      publicInfoUrl: url,
      ...placeOf(row.area),
      purpose: [COMMUNITY, ARTS, GREEN].includes(poolFor(row.category)) ? 'gather' : /repair|stay|agritourism/i.test(row.category) ? 'offer' : 'sell',
      pool: poolFor(row.category),
      interests: interestsFor(poolFor(row.category), `${row.category} ${row.name}`),
      area: row.area.trim().split('/')[0]!.replace(/\s*\(.*\)$/, '').trim() || placeOf(row.area).city,
      sources: (['name', 'description', 'website', 'address'] as const).map((field) => ({ field, url })),
      ...(row.social && Object.keys(row.social).length ? { social: row.social } : {}),
      ...(address ? { address } : {}),
      ...(sampleProductsFor(url, row.products).length ? { products: sampleProductsFor(url, row.products) } : {}),
    }
  })
  return { listed, skipped }
}
