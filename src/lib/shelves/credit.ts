// F121 — a save counts for the shelf it came from: a tap on a shelf card is remembered for this tab, and a like,
// add to calendar, remind me or follow on that card's page within 30 minutes credits the shelf once.

const KEY = 'su_shelf_tap'
const WINDOW_MS = 30 * 60_000

type Tap = { shelfId: string; path: string; at: number }

export function rememberShelfTap(store: Pick<Storage, 'setItem'>, shelfId: string, href: string, now = Date.now()): void {
  const path = new URL(href, 'https://x.invalid').pathname
  store.setItem(KEY, JSON.stringify({ shelfId, path, at: now } satisfies Tap))
}

/** The shelf to credit for a save on `pathname`, once; null when the save didn't come from a shelf tap. */
export function takeShelfCredit(store: Pick<Storage, 'getItem' | 'removeItem'>, pathname: string, now = Date.now()): string | null {
  let tap: Tap | null = null
  try {
    tap = JSON.parse(store.getItem(KEY) ?? 'null') as Tap | null
  } catch {
    return null
  }
  if (!tap || now - tap.at > WINDOW_MS) return null
  // A post's page sits under its Page's address, so a save on the Page counts for a post tapped there too.
  const page = tap.path.split('/').slice(0, 3).join('/')
  if (pathname !== tap.path && !pathname.startsWith(page)) return null
  store.removeItem(KEY)
  return tap.shelfId
}
