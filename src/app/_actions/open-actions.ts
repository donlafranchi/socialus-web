'use server'

// F118 — open your town: add a maker you love, hide your name, find your town by zip.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { townMakerAdd, townCreditSet } from '@/actions/town'
import { ActionError, ConflictError, NotFoundError } from '@/actions/_lib/errors'
import type { MakerKind } from '@/lib/open/towns'
import { pagePath } from '@/lib/groups/page-handle'

async function memberId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export type AddMakerResult =
  | { ok: true; kind: 'added' | 'exists'; publicId: string; path: string }
  | { ok: false; reason: 'signed_out' | 'link' | 'limit' | 'failed' }

export async function addMakerAction(input: { townSlug: string; place?: string; name: string; link: string; kind: MakerKind }): Promise<AddMakerResult> {
  const me = await memberId()
  if (!me) return { ok: false, reason: 'signed_out' }
  try {
    const r = await townMakerAdd(resolveActionContext({ actingMemberId: me }), input)
    revalidatePath(`/open/${input.townSlug}`)
    // #1139 — the link they send is the Page's readable address.
    const { data } = await (await createClient()).from('groups').select('place_url_slug, page_url_slug').eq('public_id', r.publicId).maybeSingle()
    const a = data as { place_url_slug: string | null; page_url_slug: string | null } | null
    return { ok: true, ...r, path: pagePath({ publicId: r.publicId, placeUrlSlug: a?.place_url_slug, pageUrlSlug: a?.page_url_slug }) }
  } catch (err) {
    if (!(err instanceof ActionError)) throw err
    if (err instanceof ConflictError) return { ok: false, reason: 'limit' }
    if (/website or a social profile/.test(err.message)) return { ok: false, reason: 'link' }
    return { ok: false, reason: 'failed' }
  }
}

export async function setCreditHiddenAction(townSlug: string, hidden: boolean): Promise<{ ok: boolean }> {
  const me = await memberId()
  if (!me) return { ok: false }
  try {
    await townCreditSet(resolveActionContext({ actingMemberId: me }), { hidden })
    revalidatePath(`/open/${townSlug}`)
    return { ok: true }
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ActionError) return { ok: false }
    throw err
  }
}

export type ZipTown = { kind: 'town'; slug: string } | { kind: 'open' } | { kind: 'elsewhere' } | { kind: 'unknown' }

/** The town a zip is in; a zip in an open market goes in, one outside the list goes to the landing waitlist. */
export async function townForZipAction(zip: string): Promise<ZipTown> {
  if (!/^\d{5}$/.test(zip.trim())) return { kind: 'unknown' }
  const supabase = await createClient()
  const keyed = await supabase.rpc('zip_market_key', { p_zip: zip.trim() })
  const key = keyed.data as string | null
  if (keyed.error || !key) return { kind: 'unknown' }
  const town = await supabase.from('towns').select('slug').eq('market_key', key).maybeSingle()
  if (town.data) return { kind: 'town', slug: (town.data as { slug: string }).slug }
  const market = await supabase.from('markets').select('is_open').eq('slug', key).maybeSingle()
  return (market.data as { is_open: boolean } | null)?.is_open ? { kind: 'open' } : { kind: 'elsewhere' }
}
