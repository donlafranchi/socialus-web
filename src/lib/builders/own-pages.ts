// #477 — the builders' own Pages, by name, read from /you.
//
// The list paints after the page ("Loading your Pages…"), so reading as soon as
// the page is up sees nothing and the journey creates every Page again. Wait for
// the settled list (cards, or the empty note) first. Archived and deleted Pages
// count too: a name the account already made is never made twice.

interface Cell {
  getAttribute(name: string): Promise<string | null>
  innerText(): Promise<string>
  locator(selector: string): { first(): { getAttribute(name: string): Promise<string | null> } }
}

export interface OwnPagesPage {
  goto(url: string): Promise<unknown>
  getByTestId(id: string): { waitFor(opts?: { timeout?: number }): Promise<void> }
  locator(selector: string): { waitFor(opts?: { timeout?: number }): Promise<void>; all(): Promise<Cell[]> }
}

const SETTLED = '[data-testid="own-pages"], [data-testid="own-pages-empty"]'
const STATES = ['own-page-live', 'own-page-draft', 'own-page-archived', 'own-page-deleted']
  .map((id) => `[data-testid="${id}"]`)
  .join(', ')

export async function readOwnPages(page: OwnPagesPage): Promise<Map<string, string>> {
  await page.goto('/you')
  await page.getByTestId('you-page').waitFor()
  await page.locator(SETTLED).waitFor({ timeout: 30_000 })
  const own = new Map<string, string>()
  for (const a of await page.locator(STATES).all()) {
    const name = (await a.getAttribute('title')) ?? (await a.innerText()).split('\n')[0]!.trim()
    const href = (await a.getAttribute('href')) ?? (await a.locator('a').first().getAttribute('href')) ?? ''
    if (name) own.set(name, href)
  }
  return own
}
