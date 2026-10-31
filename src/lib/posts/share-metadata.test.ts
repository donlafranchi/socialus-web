import { describe, it, expect, beforeEach } from 'vitest'
import { postShareMetadata } from './share-metadata'
import { postPath, isPostId } from './post-path'

// Don, 2026-10-31: "I can't share an anouncment?" — a shared post previews with its headline, its lead line and its
// one picture; a post that is not published, or that this reader may not read, previews with none of its words.

const NOW = new Date('2026-10-29T18:00:00Z') // Thu 11am in the metro
const PAGE = {
  displayName: 'Oak Park Sourdough',
  publicDescription: 'Real bread, baked local.',
  slug: 'oak-park-sourdough',
  publicId: '7k3x8m',
  lifecycleState: 'active',
  photoUrl: 'https://cdn.example/cover.webp',
  photoHiddenAt: null,
  photoRemovedAt: null,
  pictureUrl: 'https://cdn.example/picture.webp',
}
const ID = '0b6c1e9a-4a3f-4f7e-9d6b-2c1a5e8f7d10'
const POST = {
  id: ID,
  kind: 'event' as const,
  headline: 'Pizza night in the garden',
  body: 'Bring a chair.\nWe light the oven at 5.',
  startsAt: '2026-11-01T00:00:00Z', // Sat Oct 31 5pm
  endsAt: '2026-11-01T03:00:00Z', // Sat Oct 31 8pm
  createdAt: '2026-10-30T12:00:00Z',
  locationLabel: 'Midtown',
  photoUrl: 'https://cdn.example/pizza.webp',
  hiddenAt: null,
  sampleKind: null,
}
const URL_ = `https://www.socialus.org/g/7k3x8m/posts/${ID}`
const words = (m: object) => JSON.stringify(m)

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
})

describe('a post has its own address', () => {
  it('lives under its Page', () => {
    expect(postPath('/g/7k3x8m', ID)).toBe(`/g/7k3x8m/posts/${ID}`)
  })
  it('takes only a post id as minted', () => {
    expect(isPostId(ID)).toBe(true)
    expect(isPostId('edit')).toBe(false)
    expect(isPostId(`${ID}x`)).toBe(false)
  })
})

describe('a published post previews when shared', () => {
  it('titles it with its headline, describes it with its lead line and shows its own photo', () => {
    const m = postShareMetadata({ page: PAGE, post: POST, now: NOW })
    expect(m.alternates?.canonical).toBe(URL_)
    expect(m.openGraph).toMatchObject({
      title: 'Pizza night in the garden',
      description: 'Event · Sat 5–8pm · Midtown',
      url: URL_,
      siteName: 'SocialUs',
      images: [{ url: 'https://cdn.example/pizza.webp' }],
    })
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: 'Pizza night in the garden', images: ['https://cdn.example/pizza.webp'] })
  })

  it('falls back to the card headline, then the Page picture, as the card does', () => {
    const m = postShareMetadata({ page: PAGE, post: { ...POST, headline: null, photoUrl: null }, now: NOW })
    expect(m.openGraph).toMatchObject({ title: 'Bring a chair.', images: [{ url: 'https://cdn.example/picture.webp' }] })
  })

  it('falls back to the site picture when neither has one', () => {
    const m = postShareMetadata({ page: { ...PAGE, pictureUrl: null, photoUrl: null }, post: { ...POST, photoUrl: null }, now: NOW })
    expect(m.openGraph?.images).toEqual([{ url: 'https://www.socialus.org/og-default', width: 1200, height: 630 }])
  })
})

describe('a post this reader may not read previews without its words', () => {
  it('signed out (withheld): the Page name and the withheld line, never the headline, body or place', () => {
    const m = postShareMetadata({ page: PAGE, post: null, postId: ID, now: NOW })
    expect(m.openGraph).toMatchObject({ title: 'A post from Oak Park Sourdough', url: URL_ })
    expect(words(m)).not.toMatch(/Pizza|chair|Midtown|pizza\.webp/)
  })

  it('hidden after a report: no words and not indexed', () => {
    const m = postShareMetadata({ page: PAGE, post: { ...POST, hiddenAt: '2026-10-31T00:00:00Z' }, now: NOW })
    expect(words(m)).not.toMatch(/Pizza|chair|Midtown|pizza\.webp/)
    expect(m.robots).toMatchObject({ index: false })
  })

  it('on a Page that is not live: no preview at all', () => {
    const m = postShareMetadata({ page: { ...PAGE, lifecycleState: 'draft' }, post: POST, now: NOW })
    expect(m.openGraph).toBeUndefined()
    expect(m.robots).toMatchObject({ index: false })
    expect(words(m)).not.toMatch(/Pizza|chair|Midtown/)
  })
})
