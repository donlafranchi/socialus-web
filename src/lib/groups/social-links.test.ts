import { describe, it, expect } from 'vitest'
import {
  normaliseSocialLinks,
  socialLinksForDisplay,
  isSafeLinkUrl,
  SOCIAL_PLATFORMS,
} from './social-links'

describe('isSafeLinkUrl', () => {
  it('accepts an https URL', () => {
    expect(isSafeLinkUrl('https://instagram.com/claras')).toBe(true)
  })

  // The whole reason this module exists: the value is rendered as href on a
  // public Page.
  it('refuses javascript:, data: and anything else that is not https', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'http://instagram.com/claras',
      '//instagram.com/claras',
      'instagram.com/claras',
      '',
      '   ',
    ]) {
      expect(isSafeLinkUrl(bad)).toBe(false)
    }
  })

  it('refuses a URL with whitespace in it', () => {
    expect(isSafeLinkUrl('https://example.com/a b')).toBe(false)
  })
})

describe('normaliseSocialLinks', () => {
  it('keeps known platforms with safe URLs', () => {
    const { links } = normaliseSocialLinks({
      instagram: 'https://instagram.com/claras',
      website: 'https://claras.example',
    })
    expect(links).toEqual({
      instagram: 'https://instagram.com/claras',
      website: 'https://claras.example',
    })
  })

  it('drops unknown platforms silently — the key space is closed', () => {
    const { links, rejected } = normaliseSocialLinks({ myspace: 'https://myspace.com/x' })
    expect(links).toEqual({})
    expect(rejected).toEqual([])
  })

  it('reports a known platform with an unsafe URL, rather than dropping it quietly', () => {
    const { links, rejected } = normaliseSocialLinks({ instagram: 'javascript:alert(1)' })
    expect(links).toEqual({})
    expect(rejected).toEqual(['instagram'])
  })

  // Clearing a field is how a member takes a link down. That is not an error.
  it('treats an empty value as a removal, not a rejection', () => {
    const { links, rejected } = normaliseSocialLinks({ instagram: '', website: '   ' })
    expect(links).toEqual({})
    expect(rejected).toEqual([])
  })

  it('survives nonsense input', () => {
    for (const bad of [null, undefined, 'a string', 42, ['https://x.example']]) {
      expect(normaliseSocialLinks(bad)).toEqual({ links: {}, rejected: [] })
    }
  })
})

describe('socialLinksForDisplay', () => {
  it('returns nothing when there are none', () => {
    expect(socialLinksForDisplay(null)).toEqual([])
    expect(socialLinksForDisplay({})).toEqual([])
  })

  it('orders by the platform list, not by insertion', () => {
    const out = socialLinksForDisplay({ website: 'https://a.example', instagram: 'https://b.example' })
    expect(out.map((l) => l.platform)).toEqual(['instagram', 'website'])
  })

  // A row written before the constraint existed, or by anything that bypassed
  // this module, must not reach an href unchecked.
  it('withholds an unsafe URL on read as well as on write', () => {
    expect(socialLinksForDisplay({ instagram: 'javascript:alert(1)' } as never)).toEqual([])
  })

  it('carries a human label for every platform', () => {
    const all = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, 'https://x.example']))
    const out = socialLinksForDisplay(all)
    expect(out).toHaveLength(SOCIAL_PLATFORMS.length)
    for (const l of out) expect(l.label.length).toBeGreaterThan(0)
  })
})
