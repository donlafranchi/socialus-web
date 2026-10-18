// #936 — an unclaimed Page with a street address sits at that address, not at
// its town's centre (Don, 2026-10-18: "it just opens up to Sutter Creek when
// the business has an actual address"). Yelp and Google pin the street address.

import { toSlug } from '../slugify'
import { SYSTEM_MEMBER_ID } from '../system-member'

interface Db {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}
type Geocode = (q: string) => Promise<{ name: string; coordinates: [number, number] }[]>

const STREET =
  /\b(\d{2,6}\s+(?:[NSEW]\.?\s+)?[A-Z0-9][\w.'-]*(?:\s+[A-Z0-9][\w.'-]*){0,4}\s+(?:Road|Rd|Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Highway|Hwy|Court|Ct|Place|Pl|Parkway|Pkwy|Circle|Cir|Trail|Terrace))\b\.?/

/** The listed address, else a street address the row names in its own words, with its town. Never a guess. */
export function streetAddressOf(row: { city: string; text: string; address?: string | null }): string | null {
  if (row.address?.trim()) return row.address.trim()
  const m = row.text.match(STREET)
  return m ? `${m[1]!.replace(/\.$/, '')}, ${row.city}, CA` : null
}

/** How far a match may land from its town's centre and still be believed. */
const NEAR_TOWN_KM = 25
const km = ([a, b]: [number, number], [c, d]: [number, number]) => {
  const r = Math.PI / 180
  const x = (c - a) * r * Math.cos(((b + d) / 2) * r)
  return Math.hypot(x, (d - b) * r) * 6371
}

export type PinResult = { status: 'pinned' | 'would-pin'; at: [number, number] } | { status: 'already' | 'no-address' | 'not-found' | 'missing' }

/** Moves an unclaimed Page from its town's shared area Location to its own pin at its street address. Idempotent. */
export async function pinUnclaimed(
  db: Db,
  p: { name: string; publicInfoUrl: string; legacyUrl?: string; address?: string | null },
  geocode: Geocode,
  { apply = true }: { apply?: boolean } = {},
): Promise<PinResult> {
  const found = await db.query(
    `select g.id as group_id, l.kind as anchor_kind, st_x(l.geography::geometry) as town_lng, st_y(l.geography::geometry) as town_lat
       from public.groups g join public.locations l on l.id = g.anchor_location_id
      where g.unclaimed_at is not null and g.public_info_url = any($1::text[])
      limit 1`,
    [[p.publicInfoUrl, ...(p.legacyUrl ? [p.legacyUrl] : [])]],
  )
  const row = found.rows[0] as { group_id: string; anchor_kind: string; town_lng: number; town_lat: number } | undefined
  if (!row) return { status: 'missing' }
  if (row.anchor_kind !== 'area') return { status: 'already' }
  if (!p.address) return { status: 'no-address' }
  const town: [number, number] = [row.town_lng, row.town_lat]
  const hit = (await geocode(p.address)).find((m) => km(m.coordinates, town) <= NEAR_TOWN_KM)
  if (!hit) return { status: 'not-found' }
  if (!apply) return { status: 'would-pin', at: hit.coordinates }
  const [lng, lat] = hit.coordinates
  const wkt = `SRID=4326;POINT(${lng} ${lat})`
  await db.query('begin')
  try {
    const made = await db.query(
      `insert into public.locations (member_id, kind, label, slug, geography, description, place_id, discoverability)
       values ($1, 'permanent', $2, $3, $4, $5,
               (select place_id from public.place_for_coords(st_y(($4::geography)::geometry), st_x(($4::geography)::geometry))), 'listed')
       returning id`,
      [SYSTEM_MEMBER_ID, p.name, `${toSlug(p.name)}-${Math.random().toString(36).slice(2, 8)}-unclaimed`, wkt, p.address],
    )
    await db.query(`update public.groups set anchor_location_id = $1 where id = $2`, [made.rows[0]!.id, row.group_id])
    await db.query('commit')
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
  return { status: 'pinned', at: hit.coordinates }
}
