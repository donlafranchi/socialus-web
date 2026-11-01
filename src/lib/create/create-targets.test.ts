import { describe, it, expect } from 'vitest'
import { createChoices, type CreatePage, kindFromComposeParam } from './create-targets'

const sac: CreatePage = { name: 'Sac Floaters', href: '/g/abc' }
const bake: CreatePage = { name: 'Bakery', href: '/g/def' }

describe('createChoices', () => {
  it('offers only Start a Page and Propose something (Don, 2026-11-01)', () => {
    const c = createChoices({ signedIn: true, pages: [sac] })
    expect(c.map((c) => c.id)).toEqual(['page', 'wonder'])
    expect(c.map((c) => c.label)).toEqual(['Start a Page', 'Propose something'])
  })

  it('signed out, every choice goes to sign-in and back to /create', () => {
    const hrefs = createChoices({ signedIn: false, pages: [] }).map((c) => c.href)
    expect(new Set(hrefs)).toEqual(new Set(['/create']))
  })

  it('with no Page yet, a Proposal starts by creating one', () => {
    const choice = createChoices({ signedIn: true, pages: [] }).find((x) => x.id === 'wonder')!
    expect(choice.href).toBe('/create')
    expect(choice.needsPage).toBe(true)
  })

  it('with one Page, a Proposal opens that Page’s composer, named by its word', () => {
    expect(createChoices({ signedIn: true, pages: [sac] }).find((c) => c.id === 'wonder')!.href).toBe('/g/abc?compose=proposal#announce')
  })

  it('with several Pages, a Proposal asks which one instead of guessing', () => {
    expect(createChoices({ signedIn: true, pages: [sac, bake] }).find((c) => c.id === 'wonder')!.href).toBeNull()
  })

  it('a Proposal is offered as Propose something (plan #218, 2026-11-01)', () => {
    expect(createChoices({ signedIn: true, pages: [sac] }).find((c) => c.id === 'wonder')!.label).toBe('Propose something')
  })

  it('reads the old ?compose=wonder link as a Proposal', () => {
    expect(kindFromComposeParam('wonder')).toBe('wonder')
    expect(kindFromComposeParam('proposal')).toBe('wonder')
    expect(kindFromComposeParam('event')).toBe('event')
    expect(kindFromComposeParam('nope')).toBeNull()
    expect(kindFromComposeParam(null)).toBeNull()
  })

  it('Page always starts a new Page', () => {
    for (const pages of [[], [sac], [sac, bake]]) {
      expect(createChoices({ signedIn: true, pages }).find((c) => c.id === 'page')!.href).toBe('/create')
    }
  })
})

describe('pageHref', () => {
  it('builds the composer link for a chosen Page', async () => {
    const { composerHref } = await import('./create-targets')
    expect(composerHref(bake, 'news')).toBe('/g/def#announce')
    expect(composerHref(bake, 'event')).toBe('/g/def?compose=event#announce')
  })
})
