// #517 — writes planned unclaimed Pages (src/lib/unclaimed/plan.ts) to the
// database. One transaction per Page; a Page that fails changes nothing and the
// rest go on. Idempotent on the Page's own site: a Page that exists is skipped
// whether visible or hidden by a removal request, so a re-run never duplicates
// one and never brings one back (only an operator restores, #353).
import { toSlug } from '../slugify'
import { SYSTEM_MEMBER_ID } from '../system-member'
import type { PlannedPage } from './plan'

interface Db {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

export interface LoadResult {
  created: number
  existing: number
  failed: { name: string; error: string }[]
}

/** The day the researcher checked each row against the business's own site. */
export const CAPTURED_ON = '2026-10-08'
export const CAPTURED_BY = 'agent:517'

/** One area Location per city, shared by every Page in it, owned by the system member. */
async function cityLocation(db: Db, city: string): Promise<string> {
  const places = await db.query(
    `select id, coalesce(centroid, st_centroid(geography::geometry)::geography) as point
       from public.places where kind = 'city' and display_name = $1 and deleted_at is null`,
    [city],
  )
  if (places.rows.length !== 1) throw new Error(`${places.rows.length} cities named ${city}; expected 1`)
  const placeId = places.rows[0]!.id
  const found = await db.query(
    `select id from public.locations where member_id = $1 and kind = 'area' and place_id = $2 and deleted_at is null limit 1`,
    [SYSTEM_MEMBER_ID, placeId],
  )
  if (found.rows[0]) return found.rows[0].id as string
  const made = await db.query(
    `insert into public.locations (member_id, kind, label, slug, geography, place_id, discoverability)
     values ($1, 'area', $2, $3, (select coalesce(centroid, st_centroid(geography::geometry)::geography) from public.places where id = $4), $4, 'listed')
     returning id`,
    [SYSTEM_MEMBER_ID, city, `${toSlug(city)}-unclaimed`, placeId],
  )
  return made.rows[0]!.id as string
}

export async function loadUnclaimed(db: Db, pages: PlannedPage[]): Promise<LoadResult> {
  const result: LoadResult = { created: 0, existing: 0, failed: [] }
  for (const p of pages) {
    await db.query('begin')
    try {
      const had = await db.query(`select 1 from public.groups where unclaimed_at is not null and public_info_url = $1`, [p.publicInfoUrl])
      if (had.rows.length) {
        await db.query('rollback')
        result.existing++
        continue
      }
      const locationId = await cityLocation(db, p.city)
      const g = await db.query(
        `insert into public.groups (kind, purpose, founder_member_id, name, slug, description, lifecycle_state, discoverability, anchor_location_id, unclaimed_at, public_info_url)
         values ('business', $1, $2, $3, $4, $5, 'active', 'listed', $6, now(), $7) returning id`,
        [p.purpose, SYSTEM_MEMBER_ID, p.name, p.slug, p.description, locationId, p.publicInfoUrl],
      )
      const id = g.rows[0]!.id as string
      await db.query(`insert into public.group_businesses (group_id, display_name, public_description) values ($1, $2, $3)`, [id, p.name, p.description])
      for (const s of p.sources) {
        await db.query(
          `insert into public.page_sources (group_id, field, url, captured_on, captured_by) values ($1, $2, $3, $4, $5)`,
          [id, s.field, s.url, CAPTURED_ON, CAPTURED_BY],
        )
      }
      await db.query('commit')
      result.created++
    } catch (e) {
      await db.query('rollback').catch(() => {})
      result.failed.push({ name: p.name, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}
