// Don, 2026-10-27 (web #1093): Open your town is held back until after soft launch; code and migrations stay.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/open/board', () => ({ cachedBoard: vi.fn(async () => [{ slug: 'yuba', name: 'Yuba' }]), cachedContributors: vi.fn(async () => []) }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/actions/_lib/db', () => ({ getPool: vi.fn() }))

describe('Open your town flag', () => {
  it('is off by default', async () => {
    const { OPEN_YOUR_TOWN } = await import('@/lib/features')
    expect(OPEN_YOUR_TOWN).toBe(false)
  })

  it('/open is a 404 while off', async () => {
    const { default: Page } = await import('@/app/open/page')
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('/open/<town> is a 404 while off', async () => {
    const { default: Page } = await import('@/app/open/[town]/page')
    await expect(Page({ params: Promise.resolve({ town: 'yuba' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('the daily town round does nothing while off', () => {
    expect(readFileSync('scripts/market/town-round.ts', 'utf8')).toMatch(/if \(!OPEN_YOUR_TOWN\)/)
  })
})
