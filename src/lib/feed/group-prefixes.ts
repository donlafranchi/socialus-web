// T119 — Group URL prefixes for canonical Item links (F054).
//
// A Group-filed Item's canonical URL needs two things the browse reads don't
// carry: the Group's slug, and the URL place path of the Group's anchor
// Location. Both are derived live by public.group_url_prefixes (migration 037)
// rather than denormalized into discoverable_items — a Place rename then
// corrects on the next render instead of staling in the MV until some
// unrelated publish refreshes it.
//
// One RPC per result set, keyed on the distinct group_ids present.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isBrowsableKind } from './item-url'

export interface GroupPrefix {
  slug: string
  placePath: string
}

type RpcClient = Pick<SupabaseClient, 'rpc'>

interface PrefixRow {
  group_id: string
  slug: string | null
  place_path: string | null
}

/**
 * Resolve {slug, placePath} for each Group id. A Group missing either half is
 * omitted: itemHref needs both to build a canonical path, and a partial entry
 * would only invite a malformed URL downstream.
 */
export async function fetchGroupPrefixes(
  supabase: RpcClient,
  groupIds: readonly (string | null | undefined)[],
): Promise<Map<string, GroupPrefix>> {
  const ids = Array.from(new Set(groupIds.filter((id): id is string => Boolean(id))))
  const out = new Map<string, GroupPrefix>()
  if (ids.length === 0) return out

  const { data, error } = await supabase.rpc('group_url_prefixes', { p_group_ids: ids })
  // A prefix lookup failure must not take down a browse surface — every Item
  // still has a working Member-path fallback.
  if (error || !data) return out

  for (const row of data as PrefixRow[]) {
    const slug = row.slug?.trim()
    const placePath = row.place_path?.trim()
    if (slug && placePath) out.set(row.group_id, { slug, placePath })
  }
  return out
}

export interface GroupFiled {
  groupId: string | null
}

export type WithGroupPrefix<T> = T & {
  groupSlug: string | null
  groupPlacePath: string | null
}

/** Enrich a result set with its Group prefixes in one round trip. */
export async function attachGroupPrefixes<T extends GroupFiled>(
  supabase: RpcClient,
  items: readonly T[],
): Promise<WithGroupPrefix<T>[]> {
  const prefixes = await fetchGroupPrefixes(
    supabase,
    items.map((i) => i.groupId),
  )
  return items.map((item) => {
    const prefix = item.groupId ? prefixes.get(item.groupId) : undefined
    return {
      ...item,
      groupSlug: prefix?.slug ?? null,
      groupPlacePath: prefix?.placePath ?? null,
    }
  })
}

/** Drop kinds with no detail page. See BROWSABLE_KINDS for the decision. */
export function filterBrowsable<T extends { kind: string }>(items: readonly T[]): T[] {
  return items.filter((i) => isBrowsableKind(i.kind))
}
