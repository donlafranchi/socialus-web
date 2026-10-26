// F118 criterion 4 — a supporter adds a maker they love. It becomes an unclaimed Page under the
// seeder's rules: the maker's own site or social profile only, and no photo (a supporter adds
// none, so none can be uncredited or show a child). Assume the best: anyone signed in may add;
// a daily limit and the Page's own report and removal paths handle the rest.

import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { defineHandler } from '../_lib/handler'
import { ConflictError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import type { ActionContext } from '../_lib/context'
import { SYSTEM_MEMBER_ID } from '@/lib/system-member'
import { toSlug } from '@/lib/slugify'
import { MAKER_KINDS, makerLink, type MakerKind } from '@/lib/open/towns'

export const DAILY_ADDS = 10

const PURPOSE: Record<MakerKind, string> = { food: 'sell', shops: 'sell', makers: 'create', services: 'offer', groups: 'gather' }
const SOCIAL = /(^|\.)(instagram|facebook|tiktok|x|twitter|youtube)\.com$/i

export const townMakerAddInput = z.object({
  townSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  place: z.string().trim().max(120).optional(),
  name: z.string().trim().min(2).max(120),
  link: z.string().trim().min(4).max(500),
  kind: z.enum(MAKER_KINDS as [MakerKind, ...MakerKind[]]),
})

export type TownMakerAddResult = { kind: 'added' | 'exists'; publicId: string }

type Client = { query: <T>(sql: string, params: unknown[]) => Promise<{ rows: T[] }> }

async function areaLocation(client: Client, placeId: string, label: string): Promise<string> {
  const found = await client.query<{ id: string }>(
    `select id from public.locations where member_id = $1 and kind = 'area' and place_id = $2 and deleted_at is null limit 1`,
    [SYSTEM_MEMBER_ID, placeId],
  )
  if (found.rows[0]) return found.rows[0].id
  const made = await client.query<{ id: string }>(
    `insert into public.locations (member_id, kind, label, slug, geography, place_id, discoverability)
     values ($1, 'area', $2, $3, (select coalesce(centroid, st_centroid(geography::geometry)::geography) from public.places where id = $4), $4, 'listed')
     returning id`,
    [SYSTEM_MEMBER_ID, label, `${toSlug(label)}-${placeId.slice(0, 8)}-unclaimed`, placeId],
  )
  return made.rows[0]!.id
}

export const townMakerAdd = defineHandler(
  'town.maker_add',
  townMakerAddInput,
  async (ctx: ActionContext, input): Promise<TownMakerAddResult> => {
    const link = makerLink(input.link)
    if (!link.ok) throw new ValidationError('town.maker_add: its own website or a social profile, please', {})

    return withTransaction(async (client) => {
      const town = (
        await client.query<{ slug: string; county_names: string[]; place_names: string[] }>(
          `select slug, county_names, place_names from public.towns where slug = $1`,
          [input.townSlug],
        )
      ).rows[0]
      if (!town) throw new NotFoundError(`town.maker_add: no town ${input.townSlug}`)
      const place = input.place || undefined
      if (place && !town.place_names.includes(place)) throw new ValidationError('town.maker_add: that town is not in this one', {})

      const added = await client.query<{ n: string }>(
        `select count(*) as n from public.town_adds where member_id = $1 and created_at > $2::timestamptz - interval '1 day'`,
        [ctx.actingMemberId, ctx.now()],
      )
      if (Number(added.rows[0]?.n ?? 0) >= DAILY_ADDS) throw new ConflictError('town.maker_add: daily limit reached')

      const existing = await client.query<{ public_id: string }>(
        `select g.public_id from public.groups g
          where g.lifecycle_state = 'active'
            and (rtrim(lower(g.public_info_url), '/') = lower($1)
                 or (lower(g.name) = lower($2) and public.town_of_place(public.location_place(g.anchor_location_id)) = $3))
          limit 1`,
        [link.url, input.name, town.slug],
      )
      if (existing.rows[0]) return { kind: 'exists', publicId: existing.rows[0].public_id }

      const where = place ?? town.place_names[0]
      const placeRow = (
        await client.query<{ id: string; display_name: string }>(
          place || !town.county_names[0]
            ? `select id, display_name from public.places where kind = 'city' and display_name = $1 and deleted_at is null limit 1`
            : `select id, display_name from public.places where kind = 'county' and display_name = $1 and deleted_at is null limit 1`,
          [place || !town.county_names[0] ? where : town.county_names[0]],
        )
      ).rows[0]
      if (!placeRow) throw new NotFoundError(`town.maker_add: no place for ${town.slug}`)
      const locationId = await areaLocation(client, placeRow.id, placeRow.display_name)

      const g = (
        await client.query<{ id: string; public_id: string }>(
          `insert into public.groups (kind, purpose, founder_member_id, name, slug, lifecycle_state, discoverability, anchor_location_id, unclaimed_at, public_info_url)
           values ('business', $1, $2, $3, $4, 'active', 'listed', $5, $6, $7) returning id, public_id`,
          [PURPOSE[input.kind], SYSTEM_MEMBER_ID, input.name, `${toSlug(input.name).slice(0, 60) || 'page'}-${randomBytes(3).toString('hex')}`, locationId, ctx.now(), link.url],
        )
      ).rows[0]!
      await client.query(`insert into public.group_businesses (group_id, display_name) values ($1, $2)`, [g.id, input.name])
      await client.query(
        `insert into public.page_sources (group_id, field, url, captured_on, captured_by) values ($1, $2, $3, $4, $5)`,
        [g.id, SOCIAL.test(new URL(link.url).hostname) ? 'social' : 'website', link.url, ctx.now().toISOString().slice(0, 10), `member:${ctx.actingMemberId}`],
      )
      await client.query(
        `insert into public.town_adds (member_id, group_id, town_slug, maker_kind, created_at) values ($1, $2, $3, $4, $5)`,
        [ctx.actingMemberId, g.id, town.slug, input.kind, ctx.now()],
      )
      await appendEvent(ctx, 'group_events', { group_id: g.id, event_kind: 'group.added_by_neighbour', payload: { town: town.slug } })
      return { kind: 'added', publicId: g.public_id }
    })
  },
)
