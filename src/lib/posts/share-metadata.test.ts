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
    expect(postPath('/g/7k3x8m', { id: ID })).toBe(`/g/7k3x8m/posts/${ID}`)
  })
  // #1139 — under a readable Page address, by the slug from its headline; the id form only while either lacks one.
  it('under a readable Page, is the Page address and the post slug', () => {
    expect(postPath('/sacramento-ca/plant-foundry', { id: ID, urlSlug: 'fall-plant-sale' })).toBe('/sacramento-ca/plant-foundry/fall-plant-sale')
    expect(postPath('/sacramento-ca/plant-foundry#announcement-x', { id: ID, urlSlug: 'fall-plant-sale' })).toBe('/sacramento-ca/plant-foundry/fall-plant-sale')
    expect(postPath('/g/7k3x8m', { id: ID, urlSlug: 'fall-plant-sale' })).toBe(`/g/7k3x8m/posts/${ID}`)
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

  it('#1127 — a venue show previews with the kind of show and the venue, as the card does', () => {
    const show = { ...POST, headline: null, locationLabel: '1901 10th St', body: "Emo Night at The Old Ironsides\n\nShow 9pm\n\nFrom The Old Ironsides's own calendar: https://example.test", tags: ['Live music'] }
    expect(postShareMetadata({ page: PAGE, post: show, now: NOW }).openGraph).toMatchObject({ description: 'Live music · Sat 5–8pm · The Old Ironsides' })
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

// Don, 2026-10-31 (B, #1126): a preview is fetched signed out, so it shows the headline, the lead line and the photo,
// read without the body; the details stay for members.
describe('signed out, a shared post previews with its headline and lead line, never its body', () => {
  const PREVIEW = { ...POST, body: undefined }

  it('titles it with its headline, describes it with its lead line and shows its photo', () => {
    const m = postShareMetadata({ page: PAGE, post: PREVIEW, now: NOW })
    expect(m.openGraph).toMatchObject({
      title: 'Pizza night in the garden',
      description: 'Event · Sat 5–8pm · Midtown',
      url: URL_,
      images: [{ url: 'https://cdn.example/pizza.webp' }],
    })
    expect(m.twitter).toMatchObject({ title: 'Pizza night in the garden', description: 'Event · Sat 5–8pm · Midtown' })
    expect(words(m)).not.toMatch(/chair|oven/)
  })

  it('without a headline: the Page name, not a line taken from the body; the Page picture without a photo', () => {
    const m = postShareMetadata({ page: PAGE, post: { ...PREVIEW, headline: null, photoUrl: null }, now: NOW })
    expect(m.openGraph).toMatchObject({ title: 'A post from Oak Park Sourdough', images: [{ url: 'https://cdn.example/picture.webp' }] })
    expect(words(m)).not.toMatch(/chair|oven/)
  })
})

describe('a post this reader may not read previews without its words', () => {
  it('not readable at all: the Page name and the withheld line, never the headline, body or place', () => {
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

// #1139 — the preview names the readable address when the Page and the post have one.
describe('a shared post\'s preview points at its readable address', () => {
  it('canonical and og:url are /<place>/<page>/<post>', () => {
    const m = postShareMetadata({ page: { ...PAGE, placeUrlSlug: 'sacramento-ca', pageUrlSlug: 'oak-park-sourdough' }, post: POST, postUrlSlug: 'pizza-night-in-the-garden', now: NOW })
    const url = 'https://www.socialus.org/sacramento-ca/oak-park-sourdough/pizza-night-in-the-garden'
    expect(m.alternates?.canonical).toBe(url)
    expect(m.openGraph).toMatchObject({ url })
  })
})
