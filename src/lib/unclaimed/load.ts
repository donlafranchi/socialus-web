// #517 — writes planned unclaimed Pages (src/lib/unclaimed/plan.ts) to the
// database. One transaction per Page; a Page that fails changes nothing and the
// rest go on. Idempotent on the Page's own site: a Page that exists is skipped
// whether visible or hidden by a removal request, so a re-run never duplicates
// one and never brings one back (only an operator restores, #353).
import { toSlug } from '../slugify'
import { SYSTEM_MEMBER_ID } from '../system-member'
import type { PlannedPage } from './plan'
import { SAMPLE_LABEL, sampleWindow, samplePosts, type SampleKind } from './samples'
import type { Uploaded } from './upload'

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

/** The one place of this kind and name, if it sits in the same metro as Sacramento; else why not. */
async function findPlace(db: Db, name: string, kind: 'city' | 'county') {
  const found = await db.query(
    `select p.id, p.display_name, p.kind,
            exists (
              select 1 from public.metro_polygons m
               where st_intersects(m.geography, coalesce(p.centroid, st_centroid(p.geography::geometry)::geography))
                 and st_intersects(m.geography, (select coalesce(s.centroid, st_centroid(s.geography::geometry)::geography)
                                                   from public.places s where s.kind = 'city' and s.display_name = 'Sacramento' and s.deleted_at is null limit 1))
            ) as in_metro
       from public.places p where p.kind = $2 and p.display_name = $1 and p.deleted_at is null`,
    [name, kind],
  )
  const row = found.rows[0] as { id: string; display_name: string; kind: string; in_metro: boolean } | undefined
  if (found.rows.length !== 1 || !row) return { why: `${found.rows.length} ${kind} places named ${name}` }
  if (!row.in_metro) return { why: `${name} is outside the Sacramento metro` }
  return { place: row }
}

/** One area Location per place, shared by every Page in it, owned by the system member. A town not in `places` falls back to its county. */
async function placeLocation(db: Db, city: string, county?: string): Promise<string> {
  const byCity = await findPlace(db, city, 'city')
  const byCounty = !byCity.place && county ? await findPlace(db, county, 'county') : undefined
  // Prefer the town; else the county; if the county says "outside the metro" that is the more useful reason.
  const place = byCity.place ?? byCounty?.place
  if (!place) throw new Error(`${city}${county ? ` (${county})` : ''}: ${byCounty?.why ?? byCity.why}`)
  const found = await db.query(
    `select id from public.locations where member_id = $1 and kind = 'area' and place_id = $2 and deleted_at is null limit 1`,
    [SYSTEM_MEMBER_ID, place.id],
  )
  if (found.rows[0]) return found.rows[0].id as string
  const made = await db.query(
    `insert into public.locations (member_id, kind, label, slug, geography, place_id, discoverability)
     values ($1, 'area', $2, $3, (select coalesce(centroid, st_centroid(geography::geometry)::geography) from public.places where id = $4), $4, 'listed')
     returning id`,
    [SYSTEM_MEMBER_ID, place.display_name, `${toSlug(place.display_name)}${place.kind === 'county' ? '-county' : ''}-unclaimed`, place.id],
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
      const locationId = await placeLocation(db, p.city, p.county)
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

export type EnrichResult = 'missing' | 'complete' | 'enriched' | 'refreshed'

export interface Enrichment {
  /** Photos in order: the cover first, then the ones the sample posts carry. */
  photos: Uploaded[]
  phone: string | null
  social: Partial<Record<string, string>>
  /** The business's own address the pictures, phone and profiles were read from. */
  siteUrl: string
}

/** Sample posts want a cover and three more pictures behind it. */
export const PHOTOS_PER_PAGE = 4

const SOCIAL_FIELDS = ['instagram', 'facebook', 'tiktok', 'x', 'youtube']

/**
 * Brings one Page up to what Don asked for (#556): a cover photo with its credit, a few more pictures (on
 * its sample posts), a phone and profiles where its own site gives them, and sample posts that are not
 * stale. Only what is missing is written, so a re-run changes nothing; `gather` is not called for a Page
 * that already has all of it.
 */
export async function enrichPage(
  db: Db,
  page: PlannedPage,
  gather: () => Promise<Enrichment>,
  now: Date,
): Promise<EnrichResult> {
  await db.query('begin')
  try {
    const found = await db.query(
      `select id, photo_url, contact_phone, social_links, public_info_url, public_id
         from public.groups
        where unclaimed_at is not null and public_info_url = any($1::text[])`,
      [[page.publicInfoUrl, ...(page.legacyUrl ? [page.legacyUrl] : [])]],
    )
    const g = found.rows[0] as { id: string; photo_url: string | null; contact_phone: string | null; social_links: Record<string, string>; public_info_url: string } | undefined
    if (!g) {
      await db.query('rollback')
      return 'missing'
    }
    let touched = false
    if (g.public_info_url !== page.publicInfoUrl) {
      await db.query(`update public.groups set public_info_url = $2 where id = $1`, [g.id, page.publicInfoUrl])
      await db.query(`insert into public.page_sources (group_id, field, url, captured_on, captured_by) values ($1, 'website', $2, $3, $4)`, [g.id, page.publicInfoUrl, CAPTURED_ON, CAPTURED_BY])
      touched = true
    }
    const samples = await db.query(`select id, sample_kind, ends_at from public.page_posts where group_id = $1 and sample_kind is not null`, [g.id])
    const needs = !g.photo_url || samples.rows.length < 3
    if (needs) {
      const e = await gather()
      if (e.photos.length < PHOTOS_PER_PAGE) throw new Error(`only ${e.photos.length} pictures found, ${PHOTOS_PER_PAGE} wanted`)
      const [cover, ...rest] = e.photos as [Uploaded, ...Uploaded[]]
      if (!g.photo_url) {
        await db.query(`update public.groups set photo_url = $2, photo_credit = $3, photo_source_url = $4 where id = $1`, [g.id, cover.url, cover.credit, cover.sourceUrl])
        await db.query(`insert into public.page_sources (group_id, field, url, captured_on, captured_by) values ($1, 'photo', $2, $3, $4)`, [g.id, cover.sourceUrl, CAPTURED_ON, CAPTURED_BY])
      }
      if (e.phone && !g.contact_phone) {
        await db.query(`update public.groups set contact_phone = $2 where id = $1`, [g.id, e.phone])
        await db.query(`insert into public.page_sources (group_id, field, url, captured_on, captured_by) values ($1, 'phone', $2, $3, $4)`, [g.id, e.siteUrl, CAPTURED_ON, CAPTURED_BY])
      }
      const merged = { ...(g.social_links ?? {}) }
      for (const k of SOCIAL_FIELDS) if (e.social[k] && !merged[k]) merged[k] = e.social[k]!
      if (JSON.stringify(merged) !== JSON.stringify(g.social_links ?? {})) {
        await db.query(`update public.groups set social_links = $2::jsonb where id = $1`, [g.id, JSON.stringify(merged)])
        await db.query(`insert into public.page_sources (group_id, field, url, captured_on, captured_by) values ($1, 'social', $2, $3, $4)`, [g.id, e.siteUrl, CAPTURED_ON, CAPTURED_BY])
      }
      if (samples.rows.length < 3) {
        await db.query(`delete from public.page_posts where group_id = $1 and sample_kind is not null`, [g.id])
        const posts = samplePosts({ name: page.name, slug: page.slug, pool: page.pool, area: page.area }, now)
        for (const [i, post] of posts.entries()) {
          const photo = rest[i] ?? cover
          await db.query(
            `insert into public.page_posts (group_id, body, starts_at, ends_at, how_to_find, photo_url, lifecycle_state, discoverability, sample_kind, created_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, 'active', 'listed', $7, $8, $8)`,
            [g.id, `${post.body}\n\nPhoto: ${photo.credit}`, post.startsAt, post.endsAt, post.howToFind, photo.url, post.kind, new Date(now.getTime() - (posts.length - i) * 3600_000)],
          )
        }
      }
      touched = true
    }
    // A sample whose day has passed is moved to the next one, so Explore never shows a stale "tomorrow".
    for (const r of samples.rows as { id: string; sample_kind: SampleKind; ends_at: Date | null }[]) {
      if (r.ends_at && r.ends_at < now) {
        const w = sampleWindow(r.sample_kind, now, page.slug)
        await db.query(`update public.page_posts set starts_at = $2, ends_at = $3, updated_at = $4 where id = $1`, [r.id, w.startsAt, w.endsAt, now])
        touched = true
      }
    }
    await db.query('commit')
    return needs ? 'enriched' : touched ? 'refreshed' : 'complete'
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
}

export { SAMPLE_LABEL }
