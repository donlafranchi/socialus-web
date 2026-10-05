// #400 — the route: a plain 404 for everything but a match on a preview.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const { verifyOtp, tokenHash } = vi.hoisted(() => ({ verifyOtp: vi.fn(), tokenHash: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { verifyOtp } }) }))
vi.mock('@/actions/_lib/preview-pass-link', () => ({ previewPassTokenHash: tokenHash }))

import { GET } from './route'

const TOKEN = 'correct-horse-battery-staple-42'
const req = (qs: string) =>
  ({ nextUrl: new URL(`https://p.vercel.app/api/preview-signin?${qs}`), cookies: { getAll: () => [] } }) as unknown as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(process.env, {
    VERCEL_ENV: 'preview',
    PREVIEW_PASS_TOKEN: TOKEN,
    PREVIEW_PASS_EMAIL: 'don@example.test',
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk',
  })
  tokenHash.mockResolvedValue('hashed')
  verifyOtp.mockResolvedValue({ error: null })
})

describe('GET /api/preview-signin', () => {
  it('404s on production, token or not', async () => {
    process.env.VERCEL_ENV = 'production'
    const res = await GET(req(`token=${TOKEN}`))
    expect(res.status).toBe(404)
    expect(tokenHash).not.toHaveBeenCalled()
  })

  it('404s on a wrong or missing token, and mints nothing', async () => {
    expect((await GET(req('token=wrong'))).status).toBe(404)
    expect((await GET(req(''))).status).toBe(404)
    expect(tokenHash).not.toHaveBeenCalled()
  })

  it('signs in and redirects to a same-site next, setting the pass cookie', async () => {
    const res = await GET(req(`token=${TOKEN}&next=/admin/builders`))
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hashed', type: 'magiclink' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://p.vercel.app/admin/builders')
    expect(res.cookies.get('su_preview_pass')?.value).toMatch(/^[0-9a-f]{32}\.\d+$/)
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('never redirects off-site', async () => {
    const res = await GET(req(`token=${TOKEN}&next=//evil.example`))
    expect(res.headers.get('location')).toBe('https://p.vercel.app/')
  })

  it('404s if the sign-in fails', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'bad' } })
    expect((await GET(req(`token=${TOKEN}`))).status).toBe(404)
  })
})
