// #400 — what the preview pass can and can't do.

import { describe, it, expect } from 'vitest'
import { passEnabled, tokenMatches, fingerprint } from './preview-pass'

const TOKEN = 'correct-horse-battery-staple-42'
const PREVIEW = { VERCEL_ENV: 'preview', PREVIEW_PASS_TOKEN: TOKEN, PREVIEW_PASS_EMAIL: 'don@example.test' }

describe('preview pass', () => {
  it('exists only on a preview', () => {
    expect(passEnabled(PREVIEW)).toBe(true)
    expect(passEnabled({ ...PREVIEW, VERCEL_ENV: 'production' })).toBe(false)
    expect(passEnabled({ ...PREVIEW, VERCEL_ENV: undefined })).toBe(false)
    expect(tokenMatches(TOKEN, { ...PREVIEW, VERCEL_ENV: 'production' })).toBe(false)
  })

  it('needs a long token and an account', () => {
    expect(passEnabled({ ...PREVIEW, PREVIEW_PASS_TOKEN: 'short' })).toBe(false)
    expect(passEnabled({ ...PREVIEW, PREVIEW_PASS_TOKEN: undefined })).toBe(false)
    expect(passEnabled({ ...PREVIEW, PREVIEW_PASS_EMAIL: ' ' })).toBe(false)
  })

  it('matches only the exact token', () => {
    expect(tokenMatches(TOKEN, PREVIEW)).toBe(true)
    expect(tokenMatches(TOKEN + 'x', PREVIEW)).toBe(false)
    expect(tokenMatches('', PREVIEW)).toBe(false)
    expect(tokenMatches(null, PREVIEW)).toBe(false)
  })

  it('a rotated token has a different fingerprint', () => {
    expect(fingerprint(PREVIEW)).toMatch(/^[0-9a-f]{32}$/)
    expect(fingerprint({ ...PREVIEW, PREVIEW_PASS_TOKEN: TOKEN + '-rotated' })).not.toBe(fingerprint(PREVIEW))
  })
})
