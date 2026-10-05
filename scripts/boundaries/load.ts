#!/usr/bin/env tsx
// #347 — load a metro's boundary layers from public data into `boundaries`,
// then sync counties, cities and neighbourhoods into `places`.
//
//   tsx scripts/boundaries/load.ts <metro>        e.g. sacramento
//
// Needs DATABASE_URL. Idempotent: rows upsert on (layer, source_id), places on
// their parent and slug. Prints counts, nothing else. Production runs it from
// the "Boundaries" workflow; locally it runs against a local stack.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { open as openShapefile } from 'shapefile'
import { Client } from 'pg'
import { METROS, TIGER, type Metro, type NeighbourhoodSource } from './metros'

type Feature = { properties: Record<string, unknown>; geometry: unknown }
type Row = { layer: string; sourceId: string; name: string; geometry: unknown; point?: [number, number]; county?: string; source: string; url: string; licence: string; vintage: string; metadata: Record<string, unknown> }

const need = (k: string) => {
  const v = process.env[k]?.trim()
  if (!v) throw new Error(`${k} is not set`)
  return v
}

async function shapefileFeatures(url: string): Promise<Feature[]> {
  const dir = mkdtempSync(join(tmpdir(), 'boundaries-'))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  writeFileSync(join(dir, 'f.zip'), Buffer.from(await res.arrayBuffer()))
  execFileSync('unzip', ['-q', '-o', join(dir, 'f.zip'), '-d', dir])
  const shp = readdirSync(dir).find((f) => f.endsWith('.shp'))!
  const source = await openShapefile(join(dir, shp), join(dir, shp.replace(/\.shp$/, '.dbf')), { encoding: 'utf-8' })
  const out: Feature[] = []
  for (let r = await source.read(); !r.done; r = await source.read()) out.push(r.value as unknown as Feature)
  return out
}

async function arcgisFeatures(url: string): Promise<(Feature & { id?: unknown })[]> {
  const out: (Feature & { id?: unknown })[] = []
  for (let offset = 0; ; ) {
    const q = new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', f: 'geojson', resultOffset: String(offset) })
    const res = await fetch(`${url}/query?${q}`)
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    const page = (await res.json()) as { features: (Feature & { id?: unknown })[]; properties?: { exceededTransferLimit?: boolean } }
    out.push(...page.features)
    offset += page.features.length
    if (!page.properties?.exceededTransferLimit || page.features.length === 0) return out
  }
}

const intpt = (p: Record<string, unknown>): [number, number] | undefined =>
  p.INTPTLON && p.INTPTLAT ? [Number(p.INTPTLON), Number(p.INTPTLAT)] : undefined

async function gather(m: Metro): Promise<Row[]> {
  const rows: Row[] = []
  const tiger = { licence: TIGER.licence, vintage: TIGER.vintage }
  for (const f of await shapefileFeatures(TIGER.counties)) {
    const p = f.properties
    if (p.STATEFP !== m.stateFips || !m.counties.includes(String(p.COUNTYFP))) continue
    rows.push({ layer: 'county', sourceId: String(p.GEOID), name: String(p.NAME), geometry: f.geometry, county: String(p.COUNTYFP), source: 'US Census Bureau, cartographic boundary counties', url: TIGER.counties, ...tiger, metadata: {} })
  }
  for (const f of await shapefileFeatures(TIGER.places(m.stateFips))) {
    const p = f.properties
    rows.push({ layer: 'place', sourceId: String(p.GEOID), name: String(p.NAME), geometry: f.geometry, point: intpt(p), source: 'US Census Bureau, places (incorporated and CDP)', url: TIGER.places(m.stateFips), ...tiger, metadata: { lsad: p.NAMELSAD, incorporated: p.CLASSFP !== 'U1' && p.CLASSFP !== 'U2' } })
  }
  for (const f of await shapefileFeatures(TIGER.tracts(m.stateFips))) {
    const p = f.properties
    if (!m.counties.includes(String(p.COUNTYFP))) continue
    rows.push({ layer: 'tract', sourceId: String(p.GEOID), name: String(p.NAMELSAD), geometry: f.geometry, point: intpt(p), county: String(p.COUNTYFP), source: 'US Census Bureau, census tracts', url: TIGER.tracts(m.stateFips), ...tiger, metadata: {} })
  }
  for (const n of m.neighbourhoods) rows.push(...(await neighbourhoods(n)))
  return rows
}

async function neighbourhoods(n: NeighbourhoodSource): Promise<Row[]> {
  return (await arcgisFeatures(n.url))
    .filter((f) => f.geometry && String(f.properties[n.nameField] ?? '').trim())
    .map((f) => ({
      layer: 'neighborhood',
      sourceId: `${n.citySlug}:${f.properties[n.idField] ?? f.id}`,
      name: titleCase(String(f.properties[n.nameField]).trim()),
      geometry: f.geometry,
      source: n.source,
      url: n.url,
      licence: n.licence,
      vintage: n.vintage,
      metadata: { city: n.citySlug },
    }))
}

const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s)

// Simplified on load so the map and point-in-polygon stay fast; made valid
// first because source polygons occasionally self-intersect.
const GEOM = `st_multi(st_collectionextract(st_makevalid(st_simplifypreservetopology(st_setsrid(st_geomfromgeojson($4), 4326), 0.00005)), 3))`

async function upsert(db: Client, m: Metro, r: Row) {
  await db.query(
    `insert into public.boundaries (layer, source_id, name, geography, centroid, state_fips, county_fips, msa_code, source, source_url, licence, vintage, metadata, loaded_at)
     select $1, $2, $3, g::geography,
            coalesce(case when $5::float8 is not null then st_setsrid(st_makepoint($5, $6), 4326) end, st_pointonsurface(g))::geography,
            $7, $8, $9, $10, $11, $12, $13, $14, now()
       from (select ${GEOM} as g) s
     on conflict (layer, source_id) do update set
       name = excluded.name, geography = excluded.geography, centroid = excluded.centroid,
       county_fips = excluded.county_fips, msa_code = excluded.msa_code, source = excluded.source,
       source_url = excluded.source_url, licence = excluded.licence, vintage = excluded.vintage,
       metadata = excluded.metadata, loaded_at = now()`,
    [r.layer, r.sourceId, r.name, JSON.stringify(r.geometry), r.point?.[0] ?? null, r.point?.[1] ?? null, m.stateFips, r.county ?? null, null, r.source, r.url, r.licence, r.vintage, JSON.stringify(r.metadata)],
  )
}

async function stamp(db: Client, m: Metro) {
  // Everything inside the metro's counties is in the metro. Places and
  // neighbourhoods take their county from where their pin falls.
  await db.query(`update public.boundaries set msa_code = $1 where layer in ('county', 'tract') and state_fips = $2 and county_fips = any($3)`, [m.msa, m.stateFips, m.counties])
  await db.query(
    `update public.boundaries b set msa_code = $1, county_fips = c.county_fips
       from public.boundaries c
      where b.layer in ('place', 'neighborhood') and c.layer = 'county' and c.msa_code = $1
        and st_covers(c.geography, b.centroid)`,
    [m.msa],
  )
  // Places outside the metro were only needed to find the ones inside.
  await db.query(`delete from public.boundaries where layer = 'place' and msa_code is null and state_fips = $1`, [m.stateFips])
}

const SLUG = `left(trim(both '-' from regexp_replace(lower(b.name), '[^a-z0-9]+', '-', 'g')), 80)`

async function syncPlaces(db: Client, m: Metro) {
  // Counties under the state; cities and CDPs under their county;
  // neighbourhoods under their city. An existing row with the same parent and
  // slug is updated in place, so Locations already pointing at it keep working.
  const steps: [string, string, string][] = [
    ['county', 'county', `(select id from public.places where slug = $2 and kind = 'state')`],
    ['place', 'city', `(select p.id from public.places p join public.boundaries c on c.id = p.boundary_id where c.layer = 'county' and c.county_fips = b.county_fips and c.state_fips = b.state_fips)`],
    ['neighborhood', 'neighborhood', `(select id from public.places where kind = 'city' and slug = b.metadata->>'city' and msa_code = $1)`],
  ]
  for (const [layer, kind, parent] of steps) {
    await db.query(
      `with src as (
         select b.id as boundary_id, b.name, ${SLUG} as slug, b.geography, b.centroid, ${parent} as parent_id
           from public.boundaries b where b.layer = '${layer}' and b.msa_code = $1
       ), upd as (
         update public.places p set display_name = s.name, geography = s.geography, centroid = s.centroid,
                msa_code = $1, boundary_id = s.boundary_id, updated_at = now()
           from src s where p.kind = '${kind}' and p.parent_id = s.parent_id and p.slug = s.slug and p.deleted_at is null
         returning s.boundary_id
       )
       insert into public.places (parent_id, slug, display_name, kind, geography, centroid, iso_country_code, msa_code, boundary_id)
       select s.parent_id, s.slug, s.name, '${kind}', s.geography, s.centroid, 'US', $1, s.boundary_id
         from src s
        where s.parent_id is not null and s.slug <> ''
          and s.boundary_id not in (select boundary_id from upd)
          and not exists (select 1 from public.places p where p.boundary_id = s.boundary_id)
       on conflict do nothing`,
      parent.includes('$2') ? [m.msa, m.stateSlug] : [m.msa],
    )
  }
}

// Hand-drawn shapes the public data replaced stop being offered. Soft-deleted,
// not removed: Locations already pointing at them keep their breadcrumb.
async function retire(db: Client, m: Metro) {
  await db.query(
    `update public.places set deleted_at = now()
      where msa_code = $1 and kind in ('city', 'neighborhood') and boundary_id is null and deleted_at is null`,
    [m.msa],
  )
}

async function main() {
  const key = process.argv[2]
  const m = key ? METROS[key] : undefined
  if (!m) throw new Error(`usage: load.ts <${Object.keys(METROS).join('|')}>`)
  const rows = await gather(m)
  const db = new Client({ connectionString: need('DATABASE_URL') })
  await db.connect()
  try {
    await db.query('begin')
    const { rows: [{ started }] } = await db.query<{ started: Date }>('select now() as started')
    for (const r of rows) await upsert(db, m, r)
    await stamp(db, m)
    // A row this run didn't refresh is gone from its source.
    await db.query(`delete from public.boundaries where msa_code = $1 and loaded_at < $2`, [m.msa, started])
    await syncPlaces(db, m)
    await retire(db, m)
    await db.query('commit')
  } catch (err) {
    await db.query('rollback')
    throw err
  }
  const { rows: counts } = await db.query<{ layer: string; n: number }>(
    `select layer, count(*)::int as n from public.boundaries where msa_code = $1 group by layer order by layer`,
    [m.msa],
  )
  const { rows: synced } = await db.query<{ kind: string; n: number }>(
    `select kind, count(*)::int as n from public.places where msa_code = $1 and boundary_id is not null group by kind order by kind`,
    [m.msa],
  )
  for (const c of counts) console.log(`boundaries ${c.layer}: ${c.n}`)
  for (const s of synced) console.log(`places ${s.kind}: ${s.n}`)
  await db.end()
}

main().catch((err) => {
  console.error(`boundaries: ${(err as Error).message}`)
  process.exit(1)
})
