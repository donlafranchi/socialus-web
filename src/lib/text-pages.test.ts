// #489 — About, Terms and Privacy are live before the first signup. The text is
// a draft written only from rulings; what counsel must supply is listed, never
// invented ([public-is-draft]).

import { describe, it, expect } from 'vitest'
import { TEXT_PAGES } from './text-pages'

const all = Object.values(TEXT_PAGES)

describe('the three pages are live content, not placeholders', () => {
  it.each(all.map((p) => [p.slug, p] as const))('%s has a body', (_slug, page) => {
    expect(page.status).not.toBe('placeholder')
    expect(page.body.length).toBeGreaterThan(0)
  })
})

describe('legal text is marked as draft and says what counsel must supply', () => {
  it.each(['terms', 'privacy'] as const)('%s is a draft with a counsel list', (slug) => {
    const page = TEXT_PAGES[slug]
    expect(page.status).toBe('draft')
    expect(page.counsel?.length ?? 0).toBeGreaterThan(0)
  })
})

describe('Terms', () => {
  const text = TEXT_PAGES.terms.body.join(' ')
  it('states the 18+ requirement the signup checkbox points at', () => {
    expect(text).toMatch(/18 or older/)
  })
  it('names the no-children-in-photos rule (F080)', () => {
    expect(text).toMatch(/children/i)
  })
})

describe('Privacy', () => {
  const text = TEXT_PAGES.privacy.body.join(' ')
  it('says who sees what: legal name and email only operators, zip never shown, display name public', () => {
    expect(text).toMatch(/legal name/i)
    expect(text).toMatch(/seen only by operators/i)
    expect(text).toMatch(/zip/i)
    expect(text).toMatch(/display name/i)
  })
  it('carries no line about not selling member information (ruled 2026-09-30)', () => {
    expect(text).not.toMatch(/\bsell\b|\bsold\b|\bselling\b/i)
  })
  it('makes no promise about the future', () => {
    expect(text).not.toMatch(/\bwill never\b|\bforever\b|\bguarantee/i)
  })
})
