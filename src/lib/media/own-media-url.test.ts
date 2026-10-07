import { describe, expect, it } from 'vitest'
import { isOwnMediaUrl } from './own-media-url'

const ME = '0a000000-0000-4000-8000-000000000011'
const FILE = '11111111-2222-4333-8444-555555555555.webp'
const path = (m: string) => `/storage/v1/object/public/media/${m}/${FILE}`

describe('isOwnMediaUrl', () => {
  it('accepts the member’s own upload on https and on the local dev stack', () => {
    expect(isOwnMediaUrl(`https://x.supabase.co${path(ME)}`, ME)).toBe(true)
    expect(isOwnMediaUrl(`http://127.0.0.1:54321${path(ME)}`, ME)).toBe(true)
  })
  it('refuses another member’s folder, a foreign plain-http host, and a query', () => {
    expect(isOwnMediaUrl(`https://x.supabase.co${path('0a000000-0000-4000-8000-000000000012')}`, ME)).toBe(false)
    expect(isOwnMediaUrl(`http://evil.example${path(ME)}`, ME)).toBe(false)
    expect(isOwnMediaUrl(`https://x.supabase.co${path(ME)}?x=1`, ME)).toBe(false)
  })
})
