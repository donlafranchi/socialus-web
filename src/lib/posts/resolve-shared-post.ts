// A shared post's address (Don, 2026-10-31). It answers only what its reader could already read on the Page: the post
// as RLS returns it, signed in or out (F134: a visitor reads what a signed-in stranger reads). Anything else is no post.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolvePagePosts, type PagePost } from '@/lib/groups/page-posts'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'
import { isPostId } from './post-path'
import { isSlugSegment } from '@/lib/groups/page-handle'

export async function resolveSharedPost(supabase: SupabaseClient, shop: Pick<ResolvedShop, 'groupId'>, postId: string): Promise<PagePost | null> {
  if (!isPostId(postId)) return null
  const [post] = await resolvePagePosts(supabase, shop.groupId, undefined, { postId })
  return post ?? null
}

/** #1139 (Don, 2026-11-01) — the post a readable address names by its slug, as RLS lets this reader see it. */
export async function resolvePostIdBySlug(supabase: SupabaseClient, shop: Pick<ResolvedShop, 'groupId'>, slug: string): Promise<string | null> {
  if (!isSlugSegment(slug)) return null
  const { data, error } = await supabase.from('page_posts').select('id').eq('group_id', shop.groupId).eq('url_slug', slug).maybeSingle()
  return !error && data ? (data as { id: string }).id : null
}
