// #1094 — what the ➕ sheet offers, and where each choice goes.
// Posts, events and proposals are written on a Page, so with no Page the first step is making one.

import { POST_KINDS, POST_KIND_HINT, POST_KIND_WORD, isPostKind, type PostKind } from '@/lib/posts/kinds'

export type CreateKind = PostKind | 'page'
export interface CreatePage {
  name: string
  href: string
}
export interface CreateChoice {
  id: CreateKind
  label: string
  hint: string
  /** Null: more than one Page, so the sheet asks which. */
  href: string | null
  /** True when the member has no Page yet and this leads to making one first. */
  needsPage: boolean
}

// plan #218 (Don, 2026-11-01) — the button for a Proposal reads "Propose something".
const LABEL: Record<CreateKind, string> = { ...POST_KIND_WORD, wonder: 'Propose something', page: 'Page' }
const HINT: Record<CreateKind, string> = { ...POST_KIND_HINT, page: 'Start a new Page' }
const ORDER: CreateKind[] = [...POST_KINDS, 'page']

/** The link names a Proposal by its word, not the internal `wonder`; an old `?compose=wonder` link still opens one. */
const COMPOSE_PARAM: Partial<Record<PostKind, string>> = { wonder: 'proposal' }

export function kindFromComposeParam(v: string | null): PostKind | null {
  if (v === 'proposal') return 'wonder'
  return isPostKind(v) ? v : null
}

export function composerHref(page: CreatePage, kind: PostKind): string {
  const q = kind === 'news' ? '' : `?compose=${COMPOSE_PARAM[kind] ?? kind}`
  return `${page.href}${q}#announce`
}

export function createChoices({ signedIn, pages }: { signedIn: boolean; pages: CreatePage[] }): CreateChoice[] {
  return ORDER.map((id) => {
    const base = { id, label: LABEL[id], hint: HINT[id] }
    if (id === 'page' || !signedIn) return { ...base, href: '/create', needsPage: false }
    if (pages.length === 0) return { ...base, href: '/create', needsPage: true }
    if (pages.length > 1) return { ...base, href: null, needsPage: false }
    return { ...base, href: composerHref(pages[0]!, id as PostKind), needsPage: false }
  })
}
