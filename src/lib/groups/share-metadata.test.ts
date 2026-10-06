import { describe, it, expect, beforeEach } from 'vitest'
import { shareMetadata } from './share-metadata'

// #409 — a shared Page link previews with its name, description, address and picture.

const PAGE = {
  displayName: 'Oak Park Sourdough',
  publicDescription: 'Real bread, baked local.',
  slug: 'oak-park-sourdough',
  publicId: '7k3x8m',
  lifecycleState: 'active',
  photoUrl: 'https://cdn.example/cover.webp',
  photoHiddenAt: null,
  photoRemovedAt: null,
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
})

describe('#409 — a published Page previews when shared', () => {
  it('names the Page, describes it, points at its one address and shows its picture', () => {
    const m = shareMetadata(PAGE)
    const url = 'https://www.socialus.org/g/oak-park-sourdough-7k3x8m'
    expect(m.alternates?.canonical).toBe(url)
    expect(m.openGraph).toMatchObject({
      title: 'Oak Park Sourdough',
      description: 'Real bread, baked local.',
      url,
      siteName: 'SocialUs',
      images: [{ url: 'https://cdn.example/cover.webp' }],
    })
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: ['https://cdn.example/cover.webp'] })
  })

  it('falls back to the site picture when the Page has none, or its picture is hidden or removed', () => {
    for (const p of [{ ...PAGE, photoUrl: null }, { ...PAGE, photoHiddenAt: '2026-10-01T00:00:00Z' }, { ...PAGE, photoRemovedAt: '2026-10-02T00:00:00Z' }]) {
      const m = shareMetadata(p)
      expect(m.openGraph?.images).toEqual([{ url: 'https://www.socialus.org/og-default', width: 1200, height: 630 }])
    }
  })

  it('says something when the Page has no description', () => {
    expect(shareMetadata({ ...PAGE, publicDescription: '' }).openGraph?.description).toBe('Oak Park Sourdough on SocialUs.')
  })

  it('gives a draft no preview', () => {
    const m = shareMetadata({ ...PAGE, lifecycleState: 'draft' })
    expect(m.openGraph).toBeUndefined()
    expect(m.robots).toMatchObject({ index: false })
  })
})
