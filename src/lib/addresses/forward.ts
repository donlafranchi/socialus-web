// #1139 (Don, 2026-11-01) — an old /g/<id> or /g/<id>/posts/<post id> link, and where it now lives.

import { isPageId } from '@/lib/groups/page-handle'
import { isPostId } from '@/lib/posts/post-path'

export interface OldAddress {
  publicId: string
  postId: string | null
}

export function oldAddress(pathname: string): OldAddress | null {
  const m = /^\/g\/([^/]+)(?:\/posts\/([^/]+))?\/?$/.exec(pathname)
  if (!m || !isPageId(m[1]) || (m[2] !== undefined && !isPostId(m[2]))) return null
  return { publicId: m[1], postId: m[2] ?? null }
}

export interface AddressRow {
  place_url_slug: string
  page_url_slug: string
  post_url_slug: string | null
}

export function forwardPath(row: AddressRow, old: OldAddress): string | null {
  if (!row.place_url_slug || !row.page_url_slug) return null
  if (old.postId && !row.post_url_slug) return null
  return `/${row.place_url_slug}/${row.page_url_slug}${old.postId ? `/${row.post_url_slug}` : ''}`
}
