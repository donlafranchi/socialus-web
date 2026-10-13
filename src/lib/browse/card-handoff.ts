// #555 — the light payload a card carries (name, kind line, photo address) for the Page it opens. HandoffLink draws the
// Page's shell from it at once (an optimistic render); this is also kept for seconds in session storage by the Page's
// path so a Page that renders its own shell on arrival can read it. Only a Page, only the light payload.

export interface CardHandoff {
  name: string
  kindLine?: string
  imageUrl?: string | null
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
interface Opts {
  storage?: Store | null
  now?: () => number
}

const TTL_MS = 30_000
const KEY = (path: string) => `card-handoff:${path}`
const defaultStorage = (): Store | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** '/g/abc#announcement-1' → '/g/abc'; anything that is not a Page path → null. */
function pagePath(href: string): string | null {
  const path = href.split('#')[0]!.split('?')[0]!
  return /^\/g\/[^/]+$/.test(path) ? path : null
}

export function stashCardForPage(href: string, card: CardHandoff, { storage = defaultStorage(), now = Date.now }: Opts = {}): void {
  const path = pagePath(href)
  if (!path || !storage) return
  try {
    const light: CardHandoff = { name: card.name, ...(card.kindLine ? { kindLine: card.kindLine } : {}), ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}) }
    storage.setItem(KEY(path), JSON.stringify({ at: now(), card: light }))
  } catch {
    // Full or blocked: the Page simply opens on its plain outline.
  }
}

export function readCardForPage(path: string, { storage = defaultStorage(), now = Date.now }: Opts = {}): CardHandoff | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(KEY(path))
    if (!raw) return null
    const { at, card } = JSON.parse(raw) as { at: number; card: CardHandoff }
    if (typeof at !== 'number' || now() - at > TTL_MS || typeof card?.name !== 'string') return null
    return card
  } catch {
    return null
  }
}
