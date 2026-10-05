'use server'

// Creating and finding a Location — the place half of "where is it".
//
// Issue #180. These three actions lived in `src/app/you/sell/actions.ts`, a
// creator funnel that #177 retires. `LocationPlaceFields` imports them, and the
// Page edit form now embeds that component, so a Page owner changing their
// address would have been importing from a retired surface to do it. They are
// not about selling and never were: they are how anything on SocialUs says
// where it is.
//
// Renamed off the `sell` prefix on the way over. `src/app/you/sell/actions.ts`
// re-exports the old names so the composers that still call them keep working
// until #177 retires them too.

import { createClient } from '@/lib/supabase-server'
import { withTransaction } from '@/actions/_lib/db'
import { deriveInteriorPoint } from '@/lib/geo/interior-point'
import { rankPlaces, type PlaceMatch } from '@/lib/places/search'
import { succeeded, failed, type ActionResult } from '@/app/you/sell/action-result'
import { ActionError } from '@/actions'

/** Discriminated error result the client surfaces. */
class LocationActionError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

/**
 * #107 — run an action body and return its failure as DATA.
 *
 * A custom Error thrown from a 'use server' function does not cross the
 * boundary: Next replaces it with a generic digest and the message is gone.
 */
async function asResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return succeeded(await fn())
  } catch (err) {
    if (err instanceof LocationActionError) return failed(err.message, err.code)
    if (err instanceof ActionError) return failed(err.message, err.code)
    return failed(
      err instanceof Error ? err.message : 'Something went wrong. Try again.',
      'unexpected',
    )
  }
}

async function requireMemberId(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new LocationActionError('You must be signed in.', 'not_signed_in')
  }
  return data.user.id
}

export interface AddressPlacement {
  /** Geography in WKT, already resolved from a real address — e.g.
   *  `SRID=4326;POINT(${lon} ${lat})` from the geocoder's result. */
  geographyWkt: string
  /** The resolved address text, shown back to the Member for confirmation. */
  resolvedAddressText: string
}

/** A Location must be placed one of two ways: a real geocoded address, or
 *  a chosen neighbourhood. There is no third option and no default —
 *  T142 deleted the hard-coded downtown-Sacramento fallback this type
 *  replaces. A Member declining to give a street address is not the same
 *  as the platform guessing one; the type makes guessing unrepresentable. */
export type CreateLocationInput =
  | { label: string; address: AddressPlacement; neighborhoodId?: never }
  | { label: string; neighborhoodId: string; address?: never }

/** Sub-flow: inline-add a Location from the anchor-Location step (and the
 *  Product/Service composers' pickup/center-location steps — same shared
 *  action, same shared guarantee). Full `location.create` action handler
 *  is its own substrate ticket (flagged in SPEC-PATCHES); at b1 we insert
 *  via the action-layer pg pool (service-role DB connection) so we bypass
 *  RLS without exposing service-role to the browser. */
export async function createLocationAction(
  input: CreateLocationInput,
): Promise<ActionResult<{ id: string; label: string }>> {
  return asResult(async () => {
  const memberId = await requireMemberId()
  // Runtime guard alongside the compile-time one: a server action is a
  // callable network endpoint, and TypeScript's discriminated union does
  // not survive past the client. A request built without going through
  // the type (a hand-rolled fetch, a stale client bundle) must refuse the
  // same way the UI does, not fall back to a coordinate nobody chose.
  if (!('address' in input && input.address) && !('neighborhoodId' in input && input.neighborhoodId)) {
    throw new LocationActionError(
      'A Location needs a real address or a neighbourhood — we never guess one.',
      'location_needs_place',
    )
  }
  const slug =
    input.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  try {
    return await withTransaction(async (client) => {
      let geographyWkt: string
      let kind: 'permanent' | 'area'
      // T143 needs this to render "where you are now" for an address-mode
      // Location — the resolved street address, not re-derivable from the
      // stored point alone (reverse-geocoding a point yields a Place, not
      // the original address string). T142 computed this text for the UI
      // confirmation and then discarded it; persisting it here is the
      // fix-forward, not new scope.
      let description: string | null = null
      // #348 — a town or neighbourhood the owner picked is the place, even
      // when its centre falls inside a smaller one (Sacramento's centre is in
      // East Sacramento). Only an address takes its place from the point.
      let pickedPlaceId: string | null = null

      if ('address' in input && input.address) {
        geographyWkt = input.address.geographyWkt
        kind = 'permanent'
        description = input.address.resolvedAddressText
      } else {
        const neighborhoodId = (input as { neighborhoodId: string }).neighborhoodId
        const bboxRes = await client.query<{
          min_lng: number
          min_lat: number
          max_lng: number
          max_lat: number
          centre_lng: number | null
          centre_lat: number | null
        }>(
          `select
             st_xmin(geography::geometry) as min_lng,
             st_ymin(geography::geometry) as min_lat,
             st_xmax(geography::geometry) as max_lng,
             st_ymax(geography::geometry) as max_lat,
             st_x(centroid::geometry) as centre_lng,
             st_y(centroid::geometry) as centre_lat
           from public.places
          where id = $1 and kind in ('city', 'neighborhood') and deleted_at is null`,
          [neighborhoodId],
        )
        const bbox = bboxRes.rows[0]
        if (!bbox) {
          throw new LocationActionError(
            'We could not find that place. Try searching for it again.',
            'neighborhood_not_found',
          )
        }
        // #348 — Don, 2026-10-04: a neighbourhood's pin is its centre point
        // (the boundary layers carry one). Only a place without one falls back
        // to a point drawn inside its shape.
        const point =
          bbox.centre_lng != null && bbox.centre_lat != null
            ? { lng: bbox.centre_lng, lat: bbox.centre_lat }
            : deriveInteriorPoint(crypto.randomUUID(), {
                minLng: bbox.min_lng,
                minLat: bbox.min_lat,
                maxLng: bbox.max_lng,
                maxLat: bbox.max_lat,
              })
        geographyWkt = `SRID=4326;POINT(${point.lng} ${point.lat})`
        kind = 'area'
        pickedPlaceId = neighborhoodId
      }

      // Issue #180 — `place_id` is written here, and this is the only place
      // it is written.
      //
      // T075 added the column and said its population "lands in a later
      // ticket". It never did, so every Location a member ever made carried a
      // null, and everything downstream that joins through it — breadcrumbs,
      // place scoping, `browse_feed`'s `place_path` — got nothing back. That
      // was the cause of #175's dead cards before the address stopped
      // depending on geography at all.
      //
      // WHICH PLACE. The deepest containing one, smallest area on a tie.
      // `place_for_coords` already answers exactly that (it orders by
      // ST_Area ascending and takes one), so it is called rather than
      // re-decided here: two answers to "which Place is this address in" is
      // how they drift apart.
      //
      // DERIVED FROM THE POINT BEING WRITTEN, in the same statement. Not from
      // a second parameter — that would be a second chance to disagree with
      // the column — and not in a second round trip. A point no polygon covers
      // yields no row, which is null: the Location loses its breadcrumb and
      // keeps its existence.
      const result = await client.query<{ id: string; label: string; place_id: string | null }>(
        `insert into public.locations
           (member_id, kind, label, slug, geography, description, place_id)
         values (
           $1, $2, $3, $4, $5, $6,
           coalesce($7::uuid, (select place_id
              from public.place_for_coords(
                st_y(($5::geography)::geometry),
                st_x(($5::geography)::geometry)
              )))
         )
         returning id, label, place_id`,
        [memberId, kind, input.label, slug, geographyWkt, description, pickedPlaceId],
      )
      const row = result.rows[0]
      if (!row) {
        throw new LocationActionError(
          'Could not save the new Location.',
          'location_create_failed',
        )
      }
      return { id: row.id, label: row.label ?? input.label }
    })
  } catch (err) {
    if (err instanceof LocationActionError) throw err
    throw new LocationActionError(
      err instanceof Error ? err.message : 'Could not save the new Location.',
      'location_create_failed',
    )
  }
  })
}

export interface Neighborhood {
  id: string
  name: string
  slug: string
}

/** Neighbourhoods available in the "rather give a neighbourhood?" picker.
 *  Unauthenticated — this is read-only reference data, same trust level
 *  as the rest of the place tree. */
/**
 * Search cities and neighbourhoods by name, from our own `places` table.
 *
 * Deliberately NOT Mapbox: address lookup needs a token production has shipped
 * without, and this is the path that still works when that is missing. It is
 * also the right source — these are the places the platform actually knows,
 * not everything Mapbox has heard of.
 *
 * Counties and states are excluded: a Page anchored to a whole county is not a
 * location anybody meant, and the tiers above city exist for browse scoping.
 */
export async function searchPlacesAction(
  query: string,
): Promise<ActionResult<PlaceMatch[]>> {
  return asResult(async () => {
    const q = query.trim()
    if (!q) return []
    return withTransaction(async (client) => {
      const res = await client.query<{
        id: string
        display_name: string
        kind: string
        parent_name: string | null
      }>(
        `select p.id, p.display_name, p.kind, parent.display_name as parent_name
           from public.places p
           left join public.places parent on parent.id = p.parent_id
          where p.deleted_at is null
            and p.kind in ('city', 'neighborhood')
            and p.display_name ilike '%' || $1 || '%'
          order by p.display_name
          limit 25`,
        [q],
      )
      const matches: PlaceMatch[] = res.rows.map((r) => ({
        id: r.id,
        name: r.display_name,
        kind: r.kind,
        parentName: r.parent_name,
      }))
      // Ordered here rather than in SQL: the ranking is a product judgement
      // (exact, then prefix, then contains; specific beats broad) and it is
      // unit-tested without a database.
      return rankPlaces(q, matches)
    })
  })
}

export async function listNeighborhoodsAction(): Promise<Neighborhood[]> {
  return withTransaction(async (client) => {
    const result = await client.query<{ id: string; display_name: string; slug: string }>(
      `select id, display_name, slug
         from public.places
        where kind = 'neighborhood' and deleted_at is null
        order by display_name`,
    )
    return result.rows.map((r) => ({ id: r.id, name: r.display_name, slug: r.slug }))
  })
}

/**
 * #348 — the neighbourhood (or, outside one, the town) under a pin, so
 * "Show only my neighbourhood" can name it. Worked out, never picked.
 */
export async function placeForPointAction(
  lng: number,
  lat: number,
): Promise<ActionResult<{ id: string; name: string } | null>> {
  return asResult(async () => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    return withTransaction(async (client) => {
      const res = await client.query<{ id: string; display_name: string }>(
        `select p.id, p.display_name
           from public.places p
          where p.deleted_at is null and p.kind in ('neighborhood', 'city') and p.geography is not null
            and st_covers(p.geography, st_setsrid(st_makepoint($1, $2), 4326)::geography)
          order by (p.kind = 'neighborhood') desc, st_area(p.geography::geometry) asc
          limit 1`,
        [lng, lat],
      )
      const r = res.rows[0]
      return r ? { id: r.id, name: r.display_name } : null
    })
  })
}

/** #348 — the metro's main town, the anchor for "I go to them" and "It moves". */
export async function metroAnchorPlaceAction(msa = '40900'): Promise<ActionResult<{ id: string; name: string } | null>> {
  return asResult(async () =>
    withTransaction(async (client) => {
      const res = await client.query<{ id: string; display_name: string }>(
        `select p.id, p.display_name from public.places p
          where p.kind = 'city' and p.msa_code = $1 and p.deleted_at is null
          order by st_area(p.geography::geometry) desc nulls last limit 1`,
        [msa],
      )
      const r = res.rows[0]
      return r ? { id: r.id, name: r.display_name } : null
    }),
  )
}
