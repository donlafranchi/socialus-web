// #909 — a Page's featured products and services against a real database: the handler writes the row, its
// price and its event-log row together (item_events.event_kind is an allowlist), the 13th is refused, and a
// signed-out read through PostgREST's roles sees the new columns (items' SELECT is granted column by column).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { featuredItemSave, featuredItemRemove, ValidationError } from '../src/actions'
import type { ActionContext } from '../src/actions'
import { FEATURED_ITEMS_MAX } from '../src/lib/items/featured'

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "a Page's featured products are written with their price and event, capped at 12, and readable signed out",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000909'
const SHOP = 'cccccccc-0000-4000-8000-000000000909'

let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','c909@test.invalid','x',now(),now(),now())`,
    [OWNER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'c909-owner','c909-owner')`, [OWNER])
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id)
     values ($1,'business','C909 Seeds','c909-seeds','active','listed',$2)`,
    [SHOP, OWNER],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship) values ($1,$2,'owner','explicit','member')`,
    [SHOP, OWNER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.items where group_id = $1`, [SHOP])
  await client.query(`delete from public.group_memberships where group_id = $1`, [SHOP])
  await client.query(`delete from public.groups where id = $1`, [SHOP])
  await client.query(`delete from public.members where id = $1`, [OWNER])
  await client.query(`delete from auth.users where id = $1`, [OWNER])
  client.release()
  await pool.end()
})

const ctx = (): ActionContext => ({ actingMemberId: OWNER, viaDelegationId: null, traceId: 'c909-db', db: null as never, now: () => new Date() })

describe.skipIf(!RUNNABLE)('#909 — featured products and services, for real', () => {
  it('writes the item, its price and its event together, and a signed-out reader sees it', async () => {
    const { itemId } = await featuredItemSave(ctx(), { groupId: SHOP, kind: 'product', name: 'Milkweed seed', priceCents: 450, inStock: false })
    const ev = await client.query(`select event_kind from public.item_events where item_id = $1`, [itemId])
    expect(ev.rows.map((r) => r.event_kind)).toEqual(['item.created'])

    await client.query('begin')
    await client.query('set local role anon')
    const seen = await client.query(
      `select i.title, i.in_stock, i.position, i.sample_source_url, p.price_cents
         from public.items i join public.item_products p on p.item_id = i.id
        where i.id = $1`,
      [itemId],
    )
    await client.query('rollback')
    expect(seen.rows[0]).toEqual({ title: 'Milkweed seed', in_stock: false, position: 0, sample_source_url: null, price_cents: 450 })
  })

  it('a service with no price is a quote; switching it to a product moves the price', async () => {
    const { itemId } = await featuredItemSave(ctx(), { groupId: SHOP, kind: 'service', name: 'Garden plan', priceCents: null })
    expect((await client.query(`select rate_model, rate_cents from public.item_services where item_id = $1`, [itemId])).rows[0]).toEqual({ rate_model: 'quote', rate_cents: null })
    await featuredItemSave(ctx(), { groupId: SHOP, itemId, kind: 'product', name: 'Garden plan', priceCents: 2500 })
    expect((await client.query(`select count(*)::int as n from public.item_services where item_id = $1`, [itemId])).rows[0].n).toBe(0)
    expect((await client.query(`select price_cents from public.item_products where item_id = $1`, [itemId])).rows[0].price_cents).toBe(2500)
  })

  it(`refuses the ${FEATURED_ITEMS_MAX + 1}th and counts removed ones out`, async () => {
    const have = (await client.query(`select count(*)::int as n from public.items where group_id = $1 and deleted_at is null`, [SHOP])).rows[0].n
    let last = ''
    for (let n = have; n < FEATURED_ITEMS_MAX; n++) {
      last = (await featuredItemSave(ctx(), { groupId: SHOP, kind: 'product', name: `Seed ${n}` })).itemId
    }
    await expect(featuredItemSave(ctx(), { groupId: SHOP, kind: 'product', name: 'One too many' })).rejects.toBeInstanceOf(ValidationError)
    await featuredItemRemove(ctx(), { groupId: SHOP, itemId: last })
    await expect(featuredItemSave(ctx(), { groupId: SHOP, kind: 'product', name: 'Room again' })).resolves.toHaveProperty('itemId')
  })
})
