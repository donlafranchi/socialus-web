'use server'

// T073 — Server actions for the Sell walkthrough.
// Spec:   planning/now/scenario-F036-member-creates-business-group-via-sell-walkthrough.md
// Ticket: development/tickets/T073-sell-walkthrough-and-you-sell-cta.md
//
// Thin server-action wrappers around the group action handlers (T070).
// Sit between the client-side SellWalkthrough and the pg-backed handlers so
// the client never touches credentials. Each action:
//
//   1. Resolves the auth user via @supabase/ssr (cookie session).
//   2. Builds an ActionContext with actingMemberId = user.id
//      (members.id IS auth.users.id per 009_members_phase1 constraint trigger).
//   3. Invokes the handler. Maps ActionError → a JSON-serializable shape
//      the client can use to surface inline / toast messages.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { withTransaction } from '@/actions/_lib/db'
import { deriveInteriorPoint } from '@/lib/geo/interior-point'
import {
  groupCreate,
  groupUpdateDraft,
  groupActivate,
  ActionError,
} from '@/actions'

/** Discriminated error result the client surfaces. The composer's submit
 *  catches a thrown Error and renders its `.message`; we throw to preserve
 *  that path while keeping the structure for any caller that wants codes. */
class SellActionError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

async function requireMemberId(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new SellActionError(
      'You must be signed in to start selling.',
      'unauthenticated',
    )
  }
  return data.user.id
}

function rethrow(err: unknown): never {
  if (err instanceof ActionError) {
    throw new SellActionError(err.message, err.code)
  }
  throw err
}

export async function sellCreateDraftAction(input: {
  brand: string
}): Promise<{ groupId: string }> {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    const result = await groupCreate(ctx, {
      kind: 'business',
      founderMemberId: memberId,
      businessDisplayName: input.brand,
    })
    return { groupId: result.groupId }
  } catch (err) {
    rethrow(err)
  }
}

export async function sellUpdateDraftAction(input: {
  groupId: string
  brand?: string
  anchorLocationId?: string
  about?: string
}): Promise<void> {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    await groupUpdateDraft(ctx, {
      groupId: input.groupId,
      ...(input.brand !== undefined
        ? { name: input.brand, businessDisplayName: input.brand }
        : {}),
      ...(input.anchorLocationId !== undefined
        ? { anchorLocationId: input.anchorLocationId }
        : {}),
      ...(input.about !== undefined
        ? { businessPublicDescription: input.about }
        : {}),
    })
  } catch (err) {
    rethrow(err)
  }
}

export async function sellActivateAction(input: {
  groupId: string
}): Promise<{ destinationUrl: string }> {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    await groupActivate(ctx, { groupId: input.groupId })
  } catch (err) {
    rethrow(err)
  }
  // Build the place-scoped Group URL. F035 owns the page render; this
  // action just hands the URL back so the client redirects.
  //
  // T073b fix-forward: the locations table has NO `place_id` column —
  // the place resolution is geographic (via public.place_for_coords on
  // the location's geography Point) per 022_places_reverse_geocode.sql.
  // Original T073 used a PostgREST relational join that silently returned
  // null and tripped the `shop_url_unresolved` throw on every activation.
  // Reaches into the action-layer pg pool so we can call the RPC + walk
  // the parent_id chain.
  const { destinationUrl } = await withTransaction(async (client) => {
    const groupRes = await client.query<{
      slug: string
      anchor_location_id: string | null
    }>(
      `select slug, anchor_location_id
         from public.groups
        where id = $1`,
      [input.groupId],
    )
    const group = groupRes.rows[0]
    if (!group?.anchor_location_id || !group.slug) {
      throw new SellActionError(
        'Your shop was created, but we could not resolve its public URL. Refresh /you to see it.',
        'shop_url_unresolved',
      )
    }
    // Resolve the place via the location's geography centroid → place_for_coords.
    // place_for_coords expects (lat, lon); we extract from the Point.
    const placeRes = await client.query<{ place_id: string | null }>(
      `select (public.place_for_coords(
                 st_y(l.geography::geometry),
                 st_x(l.geography::geometry)
               )).place_id
         from public.locations l
        where l.id = $1`,
      [group.anchor_location_id],
    )
    const placeId = placeRes.rows[0]?.place_id
    if (!placeId) {
      throw new SellActionError(
        'Your shop was created, but we could not resolve a place for its anchor Location.',
        'shop_url_unresolved',
      )
    }
    // Walk the parent_id chain to assemble the slash-joined slug path
    // (innermost place last). Recursive CTE keeps it one query.
    const pathRes = await client.query<{ path: string }>(
      `with recursive chain(id, slug, parent_id, depth) as (
         select id, slug, parent_id, 0 from public.places where id = $1
         union all
         select p.id, p.slug, p.parent_id, c.depth + 1
           from public.places p join chain c on p.id = c.parent_id
       )
       select string_agg(slug, '/' order by depth desc) as path from chain`,
      [placeId],
    )
    const placePath = pathRes.rows[0]?.path
    if (!placePath) {
      throw new SellActionError(
        'Your shop was created, but we could not assemble its place URL.',
        'shop_url_unresolved',
      )
    }
    return { destinationUrl: `/p/${placePath}/g/${group.slug}` }
  })
  return { destinationUrl }
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
export async function sellCreateLocationAction(
  input: CreateLocationInput,
): Promise<{ id: string; label: string }> {
  const memberId = await requireMemberId()
  // Runtime guard alongside the compile-time one: a server action is a
  // callable network endpoint, and TypeScript's discriminated union does
  // not survive past the client. A request built without going through
  // the type (a hand-rolled fetch, a stale client bundle) must refuse the
  // same way the UI does, not fall back to a coordinate nobody chose.
  if (!('address' in input && input.address) && !('neighborhoodId' in input && input.neighborhoodId)) {
    throw new SellActionError(
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

      if ('address' in input && input.address) {
        geographyWkt = input.address.geographyWkt
        kind = 'permanent'
      } else {
        const neighborhoodId = (input as { neighborhoodId: string }).neighborhoodId
        const bboxRes = await client.query<{
          min_lng: number
          min_lat: number
          max_lng: number
          max_lat: number
        }>(
          `select
             st_xmin(geography::geometry) as min_lng,
             st_ymin(geography::geometry) as min_lat,
             st_xmax(geography::geometry) as max_lng,
             st_ymax(geography::geometry) as max_lat
           from public.places
          where id = $1 and kind = 'neighborhood' and deleted_at is null`,
          [neighborhoodId],
        )
        const bbox = bboxRes.rows[0]
        if (!bbox) {
          throw new SellActionError(
            'That neighbourhood could not be found.',
            'neighborhood_not_found',
          )
        }
        // Seeded by a fresh id, not the neighbourhood's own id — two
        // Pages in the same neighbourhood must not land on the same
        // point. Drawn toward the polygon's interior, not uniformly
        // across the bbox (review binding note 7: the five seeded
        // polygons are hand-drawn rectangles).
        const point = deriveInteriorPoint(crypto.randomUUID(), {
          minLng: bbox.min_lng,
          minLat: bbox.min_lat,
          maxLng: bbox.max_lng,
          maxLat: bbox.max_lat,
        })
        geographyWkt = `SRID=4326;POINT(${point.lng} ${point.lat})`
        kind = 'area'
      }

      const result = await client.query<{ id: string; label: string }>(
        `insert into public.locations
           (member_id, kind, label, slug, geography)
         values ($1, $2, $3, $4, $5)
         returning id, label`,
        [memberId, kind, input.label, slug, geographyWkt],
      )
      const row = result.rows[0]
      if (!row) {
        throw new SellActionError(
          'Could not save the new Location.',
          'location_create_failed',
        )
      }
      return { id: row.id, label: row.label ?? input.label }
    })
  } catch (err) {
    if (err instanceof SellActionError) throw err
    throw new SellActionError(
      err instanceof Error ? err.message : 'Could not save the new Location.',
      'location_create_failed',
    )
  }
}

export interface Neighborhood {
  id: string
  name: string
  slug: string
}

/** Neighbourhoods available in the "rather give a neighbourhood?" picker.
 *  Unauthenticated — this is read-only reference data, same trust level
 *  as the rest of the place tree. */
export async function sellListNeighborhoodsAction(): Promise<Neighborhood[]> {
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
