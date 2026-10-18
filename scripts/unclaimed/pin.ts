#!/usr/bin/env tsx
// #936 — pins unclaimed Pages at their street addresses (the free US Census
// geocoder), moving each off its town's shared area Location. Idempotent: a
// Page already at its address is left alone. Reports every Page that would not
// geocode, and checks Vino Tahoe (Don's report) by name.
//
//   tsx scripts/unclaimed/pin.ts            dry run: looks each address up, writes nothing
//   tsx scripts/unclaimed/pin.ts --apply    do it; needs DATABASE_URL
import { appendFileSync } from 'node:fs'
import { Client } from 'pg'
import { readPlanned } from './rows'
import { pinUnclaimed } from '../../src/lib/unclaimed/address'
import { censusGeocode } from '../../src/lib/geocoding/census'
import { mapsLinks } from '../../src/lib/maps/links'

const apply = process.argv.includes('--apply')
const summary = (line: string) => {
  console.log(line)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n')
}

async function main() {
  const dbUrl = process.env.DATABASE_URL?.trim()
  if (!dbUrl) throw new Error('DATABASE_URL is not set')
  const { listed } = readPlanned()
  const withAddress = listed.filter((p) => p.address)
  const db = new Client({ connectionString: dbUrl })
  await db.connect()
  const tally: Record<string, number> = {}
  const failed: string[] = []
  try {
    for (const p of withAddress) {
      const r = await pinUnclaimed(db, p, (q) => censusGeocode(q), { apply })
      tally[r.status] = (tally[r.status] ?? 0) + 1
      if (r.status === 'not-found') failed.push(`${p.name}: ${p.address}`)
      console.log(`${p.name}: ${r.status}${'at' in r ? ` ${r.at.join(',')}` : ''}`)
    }
    summary(`${apply ? 'Pinned' : 'Dry run'}: ${listed.length} planned Pages, ${withAddress.length} name a street address.`)
    summary(Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · '))
    if (failed.length) summary(`Would not geocode (left at their town):\n${failed.map((f) => `- ${f}`).join('\n')}`)

    // Read-only check of the Page Don named.
    const { rows } = await db.query(
      `select g.name, l.kind, l.description, st_x(l.geography::geometry) as lng, st_y(l.geography::geometry) as lat
         from public.groups g join public.locations l on l.id = g.anchor_location_id
        where g.unclaimed_at is not null and g.name = 'Vino Tahoe'`,
    )
    const v = rows[0] as { name: string; kind: string; description: string | null; lng: number; lat: number } | undefined
    if (!v) summary('Vino Tahoe: not in the database.')
    else {
      summary(`Vino Tahoe: ${v.kind} at ${v.lat.toFixed(5)},${v.lng.toFixed(5)}${v.description ? ` (${v.description})` : ''}`)
      if (v.description) {
        const target = { label: v.description, name: v.name, lng: v.lng, lat: v.lat, exact: true }
        summary(`- Apple: ${mapsLinks(target, true).directions}`)
        summary(`- Google: ${mapsLinks(target, false).directions}`)
      }
    }
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
