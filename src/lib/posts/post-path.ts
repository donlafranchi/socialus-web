// A post's own address, under its Page's (Don, 2026-10-31: "I can't share an anouncment?"). #1139 (Don, 2026-11-01):
// /<place>/<page>/<post-slug> under a readable Page address; /g/<page id>/posts/<post id> only while either has none.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const isPostId = (s: string): boolean => UUID.test(s)

export function postPath(pagePath: string, post: { id: string; urlSlug?: string | null }): string {
  const page = pagePath.split('#')[0]
  return post.urlSlug && !page.startsWith('/g/') ? `${page}/${post.urlSlug}` : `${page}/posts/${post.id}`
}
