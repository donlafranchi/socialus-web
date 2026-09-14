import { describe, it, expect } from 'vitest'
import { visiblePhotoUrl } from './visible-photo-url'

// T159 (Issue #61) — the read-path helper every surface that projects a Page
// photo must call. Hiding is a projection concern, not a deletion: the storage
// object survives a hide, which is what makes restore possible. This function
// is the single place that decision is made.

const URL = 'https://cdn.example.test/pages/oak-park.jpg'

describe('visiblePhotoUrl', () => {
  it('returns the URL when the photo is not hidden', () => {
    expect(visiblePhotoUrl({ photo_url: URL, photo_hidden_at: null })).toBe(URL)
  })

  it('returns null when photo_hidden_at is non-null', () => {
    expect(
      visiblePhotoUrl({ photo_url: URL, photo_hidden_at: new Date('2026-09-14T00:00:00Z') }),
    ).toBeNull()
  })

  it('treats a timestamp string as hidden too — projections come back as strings', () => {
    expect(visiblePhotoUrl({ photo_url: URL, photo_hidden_at: '2026-09-14 00:00:00+00' })).toBeNull()
  })

  it('returns null when there is no photo at all', () => {
    expect(visiblePhotoUrl({ photo_url: null, photo_hidden_at: null })).toBeNull()
  })

  it('returns null for a Page that is both photoless and hidden', () => {
    expect(visiblePhotoUrl({ photo_url: null, photo_hidden_at: new Date() })).toBeNull()
  })

  it('accepts a null group — an unresolved Page projects no photo', () => {
    expect(visiblePhotoUrl(null)).toBeNull()
  })
})
