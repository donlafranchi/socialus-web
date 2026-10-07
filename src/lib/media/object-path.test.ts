// #491 — a removed photo's storage object is found from the URL stored on the Page.

import { describe, it, expect } from 'vitest'
import { mediaObjectPath } from './object-path'

const BASE = 'https://khghdkdsicoeafyuvewl.supabase.co/storage/v1/object/public/media'

describe('mediaObjectPath', () => {
  it('returns the path inside the media bucket', () => {
    expect(mediaObjectPath(`${BASE}/af3d1294-61a5-4689-8ee8-7d83559adef2/004d0664.webp`)).toBe(
      'af3d1294-61a5-4689-8ee8-7d83559adef2/004d0664.webp',
    )
  })

  it('ignores a query string or fragment', () => {
    expect(mediaObjectPath(`${BASE}/a/b.webp?t=1#x`)).toBe('a/b.webp')
  })

  it.each([
    'https://example.com/photo.webp',
    `${BASE}/`,
    `${BASE}/../other/file.webp`,
    'https://khghdkdsicoeafyuvewl.supabase.co/storage/v1/object/public/other/a.webp',
    '',
    null,
  ])('is null for anything that is not a media object: %s', (url) => {
    expect(mediaObjectPath(url as string | null)).toBeNull()
  })
})
