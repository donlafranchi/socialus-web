import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { servedMediaUrl, isServedViaSite, sizedMediaUrl, sizedMediaSrcSet } from './served-url'
import { isOwnMediaUrl } from './own-media-url'
import { mediaObjectPath } from './object-path'

// #641 — Cloudflare's CSAM Scanning Tool checks images served through its cache. Member photos live in Supabase
// Storage, so they are served from our own address (a rewrite to the same object) and Cloudflare sits in front.
const STORAGE = 'https://proj.supabase.co'
const MEMBER = '11111111-1111-4111-8111-111111111111'
const OBJECT = `/storage/v1/object/public/media/${MEMBER}/22222222-2222-4222-8222-222222222222.webp`

describe('servedMediaUrl', () => {
  it('moves a storage address to the site, keeping the path', () => {
    expect(servedMediaUrl(`${STORAGE}${OBJECT}`, { enabled: true, origin: 'https://www.socialus.org' })).toBe(`https://www.socialus.org${OBJECT}`)
  })

  it('does nothing until it is switched on', () => {
    expect(servedMediaUrl(`${STORAGE}${OBJECT}`, { enabled: false, origin: 'https://www.socialus.org' })).toBe(`${STORAGE}${OBJECT}`)
  })

  it('leaves anything that is not a media object alone', () => {
    expect(servedMediaUrl('https://elsewhere.test/a.webp', { enabled: true, origin: 'https://www.socialus.org' })).toBe('https://elsewhere.test/a.webp')
  })

  it('the moved address is still accepted as the member\'s own upload, and still names the same object', () => {
    const moved = servedMediaUrl(`${STORAGE}${OBJECT}`, { enabled: true, origin: 'https://www.socialus.org' })
    expect(isOwnMediaUrl(moved, MEMBER)).toBe(true)
    expect(mediaObjectPath(moved)).toBe(mediaObjectPath(`${STORAGE}${OBJECT}`))
  })
})

describe('isServedViaSite', () => {
  it('is true for a photo on the site\'s own address, false for one still on the storage host or none', () => {
    expect(isServedViaSite(`https://www.socialus.org${OBJECT}`, STORAGE)).toBe(true)
    expect(isServedViaSite(`${STORAGE}${OBJECT}`, STORAGE)).toBe(false)
    expect(isServedViaSite(null, STORAGE)).toBe(false)
    expect(isServedViaSite('not a url', STORAGE)).toBe(false)
  })
})

describe('the site answers the storage path', () => {
  it('next.config rewrites the media path to the storage project', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = STORAGE
    const mod = await import('../../../next.config')
    const rewrites = await (mod.default as { rewrites?: () => Promise<unknown> }).rewrites?.()
    expect(rewrites).toEqual([{ source: '/storage/v1/object/public/media/:path*', destination: `${STORAGE}/storage/v1/object/public/media/:path*` }])
    expect(readFileSync(resolve(__dirname, '../../../next.config.ts'), 'utf8')).toMatch(/rewrites/)
  })
})

describe('the upload goes through it', () => {
  it('uploadImage hands the stored address to servedMediaUrl, switched by NEXT_PUBLIC_MEDIA_VIA_SITE', () => {
    const src = readFileSync(resolve(__dirname, 'upload-image.ts'), 'utf8')
    expect(src).toMatch(/servedMediaUrl\(data\.publicUrl/)
    expect(src).toMatch(/enabled: mediaViaSite\(\)/)
    expect(src).not.toMatch(/process\.env/)
    expect(readFileSync(resolve(__dirname, 'served-url.ts'), 'utf8')).toMatch(/NEXT_PUBLIC_MEDIA_VIA_SITE === '1'/)
  })
})

describe('sizedMediaUrl', () => {
  const stored = 'https://abc.supabase.co/storage/v1/object/public/media/m/1.webp'
  it('asks hosted storage for a card-sized WebP', () => {
    expect(sizedMediaUrl(stored, 320)).toBe('https://abc.supabase.co/storage/v1/render/image/public/media/m/1.webp?width=320&quality=70')
  })
  it('leaves local storage, the site address, foreign hosts and empty values alone', () => {
    for (const u of ['http://127.0.0.1:54321/storage/v1/object/public/media/m/1.webp', 'https://socialus.org/storage/v1/object/public/media/m/1.webp', 'https://images.example.com/a.jpg', `${stored}?x=1`]) {
      expect(sizedMediaUrl(u, 320)).toBe(u)
    }
    expect(sizedMediaUrl(null, 320)).toBeUndefined()
  })
})

describe('sizedMediaSrcSet', () => {
  it('gives 1x and 2x widths for hosted storage and nothing otherwise', () => {
    expect(sizedMediaSrcSet('https://abc.supabase.co/storage/v1/object/public/media/m/1.webp', 400)).toBe(
      'https://abc.supabase.co/storage/v1/render/image/public/media/m/1.webp?width=400&quality=70 1x, https://abc.supabase.co/storage/v1/render/image/public/media/m/1.webp?width=800&quality=70 2x',
    )
    expect(sizedMediaSrcSet('http://127.0.0.1:54321/storage/v1/object/public/media/m/1.webp', 400)).toBeUndefined()
    expect(sizedMediaSrcSet(null, 400)).toBeUndefined()
  })
})
