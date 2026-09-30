// T092 — Public Member page resolver (F032 read surface).
// T095 — Discoverability gate: private-by-default; render / tombstone / 404.
// Spec:   planning/now/scenario-F032-viewer-finds-member-page-and-follows.md
//         product/systems/member.md § Privacy controls (Ratified 2026-06-03)
//
// The visibility decision is made FIRST, by the SECURITY DEFINER RPC
// resolve_member_page_visibility (migration 030) — the single source of truth
// over member_privacy (which is owner-only under RLS, so the resolver cannot
// read it directly). The RPC collapses (handle, viewer, profile_visibility,
// is_discoverable, via-direct-link) into one verdict:
//   - notfound  → the page 404s. anon never learns a non-public Member exists;
//                 a search/directory origin (viaDirectLink=false) folds a
//                 non-discoverable Member into notfound too.
//   - tombstone → a signed-in, non-self viewer hit a 'private' Member's URL.
//   - render    → proceed to read the page data. The remaining reads still rely
//                 on RLS + the 029 projections (members_public_read,
//                 items_select_published, member_public_pages).
// `indexable` (render only) drives the page's robots meta: index iff the Member
// is discoverable AND public; everything else is noindex.

import type { SupabaseClient } from '@supabase/supabase-js'
import { itemHref, BROWSABLE_KINDS } from '@/lib/feed/item-url'
import { fetchGroupPrefixes } from '@/lib/feed/group-prefixes'

export interface MemberItem {
  itemId: string
  kind: string
  title: string
  brandLabel: string | null
  href: string
}

export interface MemberGroup {
  slug: string
  name: string
  kind: string
}

export interface ResolvedMemberPage {
  memberId: string
  handle: string
  displayName: string
  bio: string | null
  pronouns: string | null
  avatarUrl: string | null
  items: MemberItem[]
  groups: MemberGroup[]
  isSelf: boolean
  isFollowing: boolean
}

// Discriminated result. `null` is no longer used — every outcome is explicit so
// the page can distinguish 404 (notfound) from a private-member tombstone.
export type MemberPageView =
  | { kind: 'render'; page: ResolvedMemberPage; indexable: boolean }
  | { kind: 'tombstone'; handle: string }
  | { kind: 'notfound' }

interface MemberRow {
  id: string
  handle: string
  display_name: string
  bio: string | null
  pronouns: string | null
  avatar_url: string | null
}

interface ItemRow {
  id: string
  kind: string
  title: string
  brand_label: string | null
  group_id: string | null
}

interface GroupRow {
  slug: string
  name: string
  kind: string
}

interface VisibilityRow {
  member_id: string | null
  verdict: 'render' | 'tombstone' | 'notfound'
  is_discoverable: boolean | null
  profile_visibility: string | null
}

export async function resolveMemberPage(
  supabase: SupabaseClient,
  args: { handle: string; viewerId?: string | null; viaDirectLink?: boolean },
): Promise<MemberPageView> {
  const viewerId = args.viewerId ?? null
  const viaDirectLink = args.viaDirectLink ?? true

  // Gate first — one SECURITY DEFINER round-trip decides render/tombstone/404.
  const { data: visData, error: visErr } = await supabase.rpc('resolve_member_page_visibility', {
    p_handle: args.handle,
    p_via_direct_link: viaDirectLink,
  })
  if (visErr) return { kind: 'notfound' }

  // Set-returning function → PostgREST returns an array of rows.
  const vis = (Array.isArray(visData) ? visData[0] : visData) as VisibilityRow | undefined
  if (!vis || vis.verdict === 'notfound' || !vis.member_id) return { kind: 'notfound' }
  if (vis.verdict === 'tombstone') return { kind: 'tombstone', handle: args.handle }

  // render — index iff discoverable AND public (unlisted is link-only, never indexed).
  const indexable = vis.is_discoverable === true && vis.profile_visibility === 'public'

  const { data: memberData, error: memberErr } = await supabase
    .from('members')
    .select('id, handle, display_name, bio, pronouns, avatar_url')
    .eq('id', vis.member_id)
    .limit(1)
    .maybeSingle()

  // RLS could still withhold the row (defense in depth); treat as 404.
  if (memberErr || !memberData) return { kind: 'notfound' }
  const member = memberData as unknown as MemberRow

  const isSelf = viewerId !== null && viewerId === member.id

  // Authored, published, non-deleted Items (newest first).
  // T119 — only kinds with a detail page are listed; the filter is server-side
  // on the same enum the browse index uses. An author whose only Items are
  // withheld kinds renders the existing "Nothing posted yet." empty state.
  // #253 — items.member_id answers nobody; a profile is its owner's alone, so
  // their own items are read by id.
  const { data: ownIds } = await supabase.rpc('current_member_item_ids')
  const { data: itemData } = await supabase
    .from('items')
    .select('id, kind, title, brand_label, group_id')
    .in('id', (ownIds as string[] | null) ?? [])
    .eq('state', 'published')
    .is('deleted_at', null)
    .in('kind', [...BROWSABLE_KINDS])
    .order('created_at', { ascending: false })

  const itemRows = (itemData as unknown as ItemRow[]) ?? []
  const groupPrefixes = await fetchGroupPrefixes(
    supabase,
    itemRows.map((r) => r.group_id),
  )

  const items: MemberItem[] = itemRows.map((row) => {
    const prefix = row.group_id ? groupPrefixes.get(row.group_id) : undefined
    return {
      itemId: row.id,
      kind: row.kind,
      title: row.title,
      brandLabel: row.brand_label,
      href: itemHref({
        kind: row.kind,
        ownerHandle: member.handle,
        title: row.title,
        itemId: row.id,
        groupSlug: prefix?.slug ?? null,
        groupPlacePath: prefix?.placePath ?? null,
      }),
    }
  })

  // Listed Group memberships, one direction only: the view behind this also
  // answers Page → members, so a stranger may not read it (#241).
  const { data: groupData } = await supabase.rpc('member_public_pages', { p_member_id: member.id })

  const groups: MemberGroup[] = ((groupData as unknown as GroupRow[]) ?? []).map((row) => ({
    slug: row.slug,
    name: row.name,
    kind: row.kind,
  }))

  // Follow state — only meaningful for an auth'd, non-self viewer.
  let isFollowing = false
  if (viewerId && !isSelf) {
    const { data: followData } = await supabase
      .from('member_follows')
      .select('follower_member_id')
      .eq('follower_member_id', viewerId)
      .eq('followed_member_id', member.id)
      .is('unfollowed_at', null)
      .limit(1)
      .maybeSingle()
    isFollowing = !!followData
  }

  return {
    kind: 'render',
    indexable,
    page: {
      memberId: member.id,
      handle: member.handle,
      displayName: member.display_name,
      bio: member.bio,
      pronouns: member.pronouns,
      avatarUrl: member.avatar_url,
      items,
      groups,
      isSelf,
      isFollowing,
    },
  }
}
