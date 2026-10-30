import { describe, it, expect } from 'vitest'
import { createChoices, type CreatePage } from './create-targets'

const sac: CreatePage = { name: 'Sac Floaters', href: '/g/abc' }
const bake: CreatePage = { name: 'Bakery', href: '/g/def' }

describe('createChoices', () => {
  it('lists Post, Event, Page and Wonder, in that order', () => {
    expect(createChoices({ signedIn: true, pages: [sac] }).map((c) => c.id)).toEqual(['post', 'event', 'page', 'wonder'])
  })

  it('signed out, every choice goes to sign-in and back to /create', () => {
    const hrefs = createChoices({ signedIn: false, pages: [] }).map((c) => c.href)
    expect(new Set(hrefs)).toEqual(new Set(['/create']))
  })

  it('with no Page yet, Post, Event and Wonder start by creating one', () => {
    const c = createChoices({ signedIn: true, pages: [] })
    for (const id of ['post', 'event', 'wonder'] as const) {
      const choice = c.find((x) => x.id === id)!
      expect(choice.href).toBe('/create')
      expect(choice.needsPage).toBe(true)
    }
  })

  it('with one Page, Post opens that Page’s composer', () => {
    expect(createChoices({ signedIn: true, pages: [sac] }).find((c) => c.id === 'post')!.href).toBe('/g/abc#announce')
  })

  it('Event and Wonder say what they are in the link', () => {
    const c = createChoices({ signedIn: true, pages: [sac] })
    expect(c.find((c) => c.id === 'event')!.href).toBe('/g/abc?compose=event#announce')
    expect(c.find((c) => c.id === 'wonder')!.href).toBe('/g/abc?compose=wonder#announce')
  })

  it('with several Pages, Post asks which one instead of guessing', () => {
    const post = createChoices({ signedIn: true, pages: [sac, bake] }).find((c) => c.id === 'post')!
    expect(post.href).toBeNull()
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
    expect(composerHref(bake, 'post')).toBe('/g/def#announce')
    expect(composerHref(bake, 'event')).toBe('/g/def?compose=event#announce')
  })
})
