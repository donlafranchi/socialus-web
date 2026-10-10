// Every planned unclaimed Page: the maker lists (makers*.json) and the first researched listings.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { planListings, planMakers, type ListingRow, type MakerRow, type PlannedPage } from '../../src/lib/unclaimed/plan'

/** Dead addresses and where the business actually answers (scripts/unclaimed/link-fixes.json). */
function applyFixes(pages: PlannedPage[], dir: string): PlannedPage[] {
  const fixes = JSON.parse(readFileSync(join(dir, 'link-fixes.json'), 'utf8')) as Record<string, string>
  return pages.map((p) => (fixes[p.publicInfoUrl] ? { ...p, legacyUrl: p.publicInfoUrl, publicInfoUrl: fixes[p.publicInfoUrl]! } : p))
}

export function readPlanned(dir = __dirname): { listed: PlannedPage[]; skipped: { name: string; reason: string }[]; files: string[] } {
  const files = readdirSync(dir).filter((f) => /^makers.*\.json$/.test(f)).sort()
  const makers = files.flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as MakerRow[])
  const { listed, skipped } = planMakers(makers)
  const listings = planListings(JSON.parse(readFileSync(join(dir, 'listings.json'), 'utf8')) as ListingRow[])
  // A listing whose own site is already a maker row is one Page, the maker row's.
  const host = (u: string) => new URL(u).hostname.replace(/^www\./, '')
  const have = new Set(listed.map((p) => host(p.publicInfoUrl)))
  return { listed: applyFixes([...listed, ...listings.filter((p) => !have.has(host(p.publicInfoUrl)))], dir), skipped, files: [...files, 'listings.json'] }
}
