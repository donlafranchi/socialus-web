// #400 — what the preview pass can and can't do.

import { describe, it, expect } from 'vitest'
import { passEnabled, tokenMatches, passCookieValue, passCookieStillGood } from './preview-pass'

const TOKEN = 'correct-horse-battery-staple-42'
const PREVIEW = { VERCEL_ENV: 'preview', PREVIEW_PASS_TOKEN: TOKEN, PREVIEW_PASS_EMAIL: 'don@example.test' }
const DAY = 864e5

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

  it('a session lasts 30 days, then ends', () => {
    const t0 = new Date('2026-10-05T12:00:00Z')
    const v = passCookieValue(PREVIEW, t0)
    expect(passCookieStillGood(v, PREVIEW, new Date(t0.getTime() + 29 * DAY))).toBe(true)
    expect(passCookieStillGood(v, PREVIEW, new Date(t0.getTime() + 30 * DAY))).toBe(false)
  })

  it('rotating the token ends sessions made with the old one', () => {
    const v = passCookieValue(PREVIEW, new Date())
    expect(passCookieStillGood(v, { ...PREVIEW, PREVIEW_PASS_TOKEN: TOKEN + '-rotated' }, new Date())).toBe(false)
  })

  it('a tampered or garbled cookie is not good', () => {
    expect(passCookieStillGood('nope', PREVIEW, new Date())).toBe(false)
    const [fp] = passCookieValue(PREVIEW, new Date()).split('.')
    expect(passCookieStillGood(`${fp}.${Date.now() + DAY}`, PREVIEW, new Date())).toBe(false)
  })
})
