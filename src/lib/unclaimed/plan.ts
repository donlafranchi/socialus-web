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

export type SkipReason = 'held-out' | 'held' | 'no-own-site' | 'personal-care' | 'no-site'

export interface PlannedPage {
  name: string
  slug: string
  description: string
  publicInfoUrl: string
  city: string
  purpose: 'sell' | 'offer'
  sources: { field: 'name' | 'description' | 'website' | 'address'; url: string }[]
}

/** Don is visiting these in person (2026-10-09): matched on the start of the name. */
export const HELD_OUT = [
  'Real Pie Company', 'Freeport Bakery', "Gunther's Ice Cream", 'MADE Studio', 'Insomnia Hot',
  'Ginger Elizabeth', 'Alaro', 'Little Relics', 'Chocolate Fish', 'Myrtle Press',
] as const

export const CLAIM_LINE = 'Claim this Page to tell your own story.'

const CITIES = ['West Sacramento', 'Granite Bay', 'Clarksburg', 'Elk Grove', 'Folsom', 'Carmichael'] as const
const PERSONAL_CARE = /\b(salon|barber|nail|spa|hair|beauty|lash|wax)\b/i
const NONPROFIT_OR_GALLERY = /nonprofit|gallery|center for the arts|tool library|association|co-?op\b|potters group/i
const RANK = (c: string) => (/^High/i.test(c) ? 0 : /^Medium-high/i.test(c) ? 1 : 2)

const https = (u: string) => u.replace(/^http:\/\//i, 'https://')
const cityOf = (area: string) => CITIES.find((c) => area.toLowerCase().includes(c.toLowerCase())) ?? 'Sacramento'

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

export function planMakers(rows: MakerRow[]): { listed: PlannedPage[]; skipped: { name: string; reason: SkipReason }[] } {
  const skipped: { name: string; reason: SkipReason }[] = []
  const keep: { row: MakerRow; rank: number; nonprofit: boolean }[] = []
  for (const row of rows) {
    const reason: SkipReason | null = HELD_OUT.some((h) => row.name.toLowerCase().startsWith(h.toLowerCase()))
      ? 'held-out'
      : /HOLD|^Low-medium/i.test(row.confidence)
        ? 'held'
        : /no own site/i.test(row.confidence)
          ? 'no-own-site'
          : PERSONAL_CARE.test(`${row.name} ${row.makes}`)
            ? 'personal-care'
            : !/^https?:\/\//i.test(row.site)
              ? 'no-site'
              : null
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
      city: cityOf(row.area),
      purpose: /repair/i.test(row.category) ? 'offer' : 'sell',
      sources: (['name', 'description', 'website', 'address'] as const).map((field) => ({ field, url })),
    }
  })
  return { listed, skipped }
}
