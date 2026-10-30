// #1094 — what the ➕ sheet offers, and where each choice goes.
// Posts, events and wonders are written on a Page, so with no Page the first step is making one.

export type CreateKind = 'post' | 'event' | 'page' | 'wonder'
export interface CreatePage {
  name: string
  href: string
}
export interface CreateChoice {
  id: CreateKind
  label: string
  /** Null: more than one Page, so the sheet asks which. */
  href: string | null
  /** True when the member has no Page yet and this leads to making one first. */
  needsPage: boolean
}

const LABEL: Record<CreateKind, string> = { post: 'Post', event: 'Event', page: 'Page', wonder: 'Wonder' }
const ORDER: CreateKind[] = ['post', 'event', 'page', 'wonder']

export function composerHref(page: CreatePage, kind: Exclude<CreateKind, 'page'>): string {
  const q = kind === 'post' ? '' : `?compose=${kind}`
  return `${page.href}${q}#announce`
}

export function createChoices({ signedIn, pages }: { signedIn: boolean; pages: CreatePage[] }): CreateChoice[] {
  return ORDER.map((id) => {
    const base = { id, label: LABEL[id] }
    if (id === 'page' || !signedIn) return { ...base, href: '/create', needsPage: false }
    if (pages.length === 0) return { ...base, href: '/create', needsPage: true }
    if (pages.length > 1) return { ...base, href: null, needsPage: false }
    return { ...base, href: composerHref(pages[0]!, id), needsPage: false }
  })
}
