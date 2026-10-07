// #477 — nine extra copies of six Pages in production. The builders decide what
// to create from the names on /you, and /you paints those names AFTER the page
// itself ("Loading your Pages…"). A read that stopped at the page saw nothing,
// concluded no Page existed yet, and created the first two of every kind again.

import { describe, it, expect } from 'vitest'
import { readOwnPages, type OwnPagesPage } from './own-pages'
import { ROSTER, todaysNew } from '../../../evals/builders/roster'

/** A /you whose Pages appear only after the list settles, as in the browser. */
function youPage(pages: { name: string; href: string; state?: string }[]) {
  let settled = false
  const settle = () => new Promise<void>((r) => setTimeout(() => ((settled = true), r()), 20))
  const fake: OwnPagesPage = {
    goto: async () => {},
    locator: (selector: string) => ({
      waitFor: async () => {
        if (selector.includes('own-pages-empty') || selector.includes('"own-pages"')) await settle()
      },
      all: async () =>
        settled
          ? pages.map((p) => ({
              getAttribute: async (a: string) => (a === 'title' ? p.name : a === 'href' ? p.href : null),
              innerText: async () => p.name,
              locator: () => ({ first: () => ({ getAttribute: async () => p.href }) }),
            }))
          : [],
    }),
    getByTestId: () => ({ waitFor: async () => {} }),
  }
  return fake
}

describe('readOwnPages', () => {
  it('waits for the list to settle before reading it', async () => {
    const own = await readOwnPages(youPage([{ name: 'Slow Drift Apiary', href: '/g/slow-drift' }]))
    expect([...own.keys()]).toEqual(['Slow Drift Apiary'])
  })

  it('so a Page that already exists is never offered for creation again', async () => {
    const own = await readOwnPages(youPage(ROSTER.slice(0, 3).map((o) => ({ name: o.name, href: `/g/${o.key}` }))))
    const today = todaysNew(new Set(own.keys()), 2).map((o) => o.name)
    for (const o of ROSTER.slice(0, 3)) expect(today).not.toContain(o.name)
  })
})

describe('the roster', () => {
  it('has no two organizations with one name', () => {
    const names = ROSTER.map((o) => o.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
