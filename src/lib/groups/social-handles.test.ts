// Handles, not URLs.
//
// The first block is the bug Don hit, reproduced and then fixed. The rest is
// the rule that matters: PERMISSIVE. We are not verifying accounts exist, and a
// regex stricter than the platform's refuses real people with no way around it.

import { describe, it, expect } from 'vitest'
import { checkHandle, cleanHandle, handlesFromLinks, linksFromHandles, PLATFORM_FIELDS } from './social-handles'
import { SOCIAL_PLATFORMS } from './social-links'

describe('what Don typed now works', () => {
  // Every one of these was refused before, with "these links are not https
  // URLs and were refused: instagram".
  it.each([
    'donlafranchi',
    '@donlafranchi',
    'instagram.com/donlafranchi',
    'http://instagram.com/donlafranchi',
    'https://instagram.com/donlafranchi',
    '  donlafranchi  ',
    'donlafranchi/',
  ])('accepts %j', (input) => {
    const r = checkHandle('instagram', input)
    expect(r.ok).toBe(true)
    expect(r.url).toBe('https://instagram.com/donlafranchi')
  })
})

describe('validation is permissive, because a refused real handle is our bug', () => {
  it('accepts dots, underscores, hyphens and digits', () => {
    for (const h of ['a.b_c-d1', '__x__', '1234', 'a-very-long-handle-name']) {
      expect(checkHandle('instagram', h).ok, h).toBe(true)
    }
  })

  it('accepts a Bluesky handle, which is a domain and full of dots', () => {
    const r = checkHandle('bluesky', 'don.lafranchi.social')
    expect(r.ok).toBe(true)
    expect(r.url).toBe('https://bsky.app/profile/don.lafranchi.social')
  })

  it('keeps the @ that TikTok and YouTube URLs carry', () => {
    expect(checkHandle('tiktok', 'priyamakes').url).toBe('https://tiktok.com/@priyamakes')
    expect(checkHandle('youtube', '@priyamakes').url).toBe('https://youtube.com/@priyamakes')
  })

  it('takes a website as a bare domain', () => {
    expect(checkHandle('website', 'oakparkbakery.com').url).toBe('https://oakparkbakery.com')
    expect(checkHandle('website', 'https://oakparkbakery.com').url).toBe('https://oakparkbakery.com')
  })

  // The only things refused are those that cannot be part of a URL path.
  it('refuses only what genuinely cannot be a handle', () => {
    for (const bad of ['has space', 'a/b', 'a?b', 'a#b']) {
      expect(checkHandle('instagram', bad).ok, bad).toBe(false)
    }
  })

  it('says what IS allowed when it refuses, not what is not', () => {
    const r = checkHandle('instagram', 'has space')
    expect(r.problem).toMatch(/letters, numbers/i)
    expect(r.problem).not.toMatch(/invalid|error|not allowed/i)
  })
})

describe('an empty field is a removal, not an error', () => {
  it.each(['', '   '])('treats %j as clearing the link', (v) => {
    const r = checkHandle('instagram', v)
    expect(r.ok).toBe(true)
    expect(r.url).toBe('')
  })

  it('drops cleared platforms from the saved map', () => {
    const { links } = linksFromHandles({ instagram: 'a', tiktok: '' })
    expect(links).toEqual({ instagram: 'https://instagram.com/a' })
  })
})

describe('round-tripping — a member always sees what they typed', () => {
  it('shows the handle back, not the URL', () => {
    const { links } = linksFromHandles({ instagram: 'donlafranchi', tiktok: 'priyamakes' })
    expect(handlesFromLinks(links)).toEqual({ instagram: 'donlafranchi', tiktok: 'priyamakes' })
  })

  it('survives a www. prefix on a stored URL', () => {
    expect(handlesFromLinks({ instagram: 'https://www.instagram.com/clara' }).instagram).toBe('clara')
  })

  // Nothing a member saved may vanish from the form because we cannot parse it.
  it('shows an undecomposable stored URL as itself rather than dropping it', () => {
    const odd = 'https://instagram.com/'
    expect(handlesFromLinks({ instagram: odd }).instagram).toBe(odd)
  })
})

describe('every platform is wired', () => {
  it('has a field definition for each one, with a prefix to show', () => {
    for (const p of SOCIAL_PLATFORMS) {
      expect(PLATFORM_FIELDS[p], p).toBeDefined()
      expect(PLATFORM_FIELDS[p].prefix.length, p).toBeGreaterThan(0)
    }
  })

  it('always composes an https URL — the value reaches an href', () => {
    for (const p of SOCIAL_PLATFORMS) {
      const r = checkHandle(p, p === 'website' ? 'example.com' : 'someone')
      expect(r.url.startsWith('https://'), p).toBe(true)
    }
  })

  it('reports problems per platform rather than failing the whole save', () => {
    const { links, problems } = linksFromHandles({ instagram: 'fine', tiktok: 'has space' })
    expect(links.instagram).toBeDefined()
    expect(problems.tiktok).toBeTruthy()
    expect(problems.instagram).toBeUndefined()
  })
})

describe('cleanHandle', () => {
  it('pulls the handle out of a pasted profile URL', () => {
    expect(cleanHandle('tiktok', 'https://www.tiktok.com/@priyamakes')).toBe('priyamakes')
    expect(cleanHandle('bluesky', 'https://bsky.app/profile/don.social')).toBe('don.social')
  })
})
