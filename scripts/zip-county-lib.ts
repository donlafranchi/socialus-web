// Pure parts of scripts/generate-zip-county-migration.ts, kept apart so they can be tested on fixtures.
export type Table = string[][]

export const rows = (t: string): Table =>
  t.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(/[|\t]/).map((c) => c.trim()))

// Column positions from each header, so a reordered file fails loudly rather than silently.
export const col = (h: string[], n: string) => {
  const i = h.indexOf(n)
  if (i < 0) throw new Error(`missing column ${n}`)
  return i
}

export function counts(file: Table, zipCol: string, idCol: string): Map<string, number> {
  const h = file[0]!
  const z = col(h, zipCol), g = col(h, idCol)
  const seen = new Map<string, Set<string>>()
  for (const r of file.slice(1)) {
    if (!/^\d{5}$/.test(r[z]!)) continue
    seen.set(r[z]!, (seen.get(r[z]!) ?? new Set()).add(r[g]!))
  }
  return new Map([...seen].map(([k, v]) => [k, v.size]))
}

// Largest share wins; a tie goes to the lower code so the same zip always gives the same answer.
const better = (area: number, id: string, cur?: { id: string; area: number }) =>
  !cur || area > cur.area || (area === cur.area && id < cur.id)

export function largest(file: Table, zipCol: string, partCol: string, idCol: string): Map<string, string> {
  const h = file[0]!
  const z = col(h, zipCol), g = col(h, idCol), a = col(h, partCol)
  const best = new Map<string, { id: string; area: number }>()
  for (const r of file.slice(1)) {
    const zip = r[z]!
    if (!/^\d{5}$/.test(zip)) continue // the rows with no ZCTA are land outside every zip
    const area = Number(r[a])
    if (better(area, r[g]!, best.get(zip))) best.set(zip, { id: r[g]!, area })
  }
  return new Map([...best].map(([k, v]) => [k, v.id]))
}

// bug #905: the 2020 relationship files use Connecticut's eight old counties (09001–09015); since 2022 the Census
// counts its nine planning regions (09110–09190) instead, and kept each county subdivision's code. So a Connecticut
// zip's region is the one whose subdivisions hold the largest land share of it (a 2023 cousub gazetteer names each
// subdivision's region). `zips` are the zips whose largest county is an old Connecticut one.
export function connecticutRegions(zips: Iterable<string>, zipCousub: Table, gazCousubs: Table): Map<string, { fips: string; spans: number }> {
  const gh = gazCousubs[0]!
  const gid = col(gh, 'GEOID')
  const region = new Map<string, string>()
  for (const r of gazCousubs.slice(1)) if (r[gid]!.startsWith('09')) region.set(r[gid]!.slice(5), r[gid]!.slice(0, 5))
  const want = new Set(zips)
  const h = zipCousub[0]!
  const z = col(h, 'GEOID_ZCTA5_20'), g = col(h, 'GEOID_COUSUB_20'), a = col(h, 'AREALAND_PART')
  const land = new Map<string, Map<string, number>>()
  const outside = new Set<string>()
  for (const r of zipCousub.slice(1)) {
    const zip = r[z]!, geoid = r[g]!, area = Number(r[a])
    if (!want.has(zip) || !(area > 0)) continue
    if (!geoid.startsWith('09')) {
      outside.add(zip) // land over the state line: counted toward the guess, never picked
      continue
    }
    const fips = region.get(geoid.slice(5))
    if (!fips) throw new Error(`no planning region for county subdivision ${geoid}`)
    const m = land.get(zip) ?? new Map<string, number>()
    land.set(zip, m.set(fips, (m.get(fips) ?? 0) + area))
  }
  const out = new Map<string, { fips: string; spans: number }>()
  for (const zip of want) {
    const m = land.get(zip)
    if (!m) throw new Error(`Connecticut zip ${zip} has no land in any county subdivision`)
    let best: { id: string; area: number } | undefined
    for (const [id, area] of m) if (better(area, id, best)) best = { id, area }
    out.set(zip, { fips: best!.id, spans: m.size + (outside.has(zip) ? 1 : 0) })
  }
  return out
}
