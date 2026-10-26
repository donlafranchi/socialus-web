// #1090 — /open/<market>: aggregate counts only, a share link, and Don's line.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { OPEN_COPY } from '@/lib/open-market-copy'
import type { OpenMarket } from '@/lib/metro/open-market'

const market = vi.fn<(key: string) => Promise<OpenMarket | null>>()
vi.mock('@/lib/metro/open-market', () => ({ openMarketFor: (k: string) => market(k) }))
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))

import OpenMarketPage from './[market]/page'

afterEach(cleanup)
const page = async (key: string) => render(await OpenMarketPage({ params: Promise.resolve({ market: key }) }))

describe('/open/<market>', () => {
  it('a waiting market: Don’s line, both counts against their goals, and a share link', async () => {
    market.mockResolvedValue({ key: 'tahoe', name: 'Lake Tahoe', open: false, makers: { count: 12, goal: 100 }, supporters: { count: 340, goal: 1000 } })
    await page('tahoe')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(OPEN_COPY.notOpen('Lake Tahoe'))
    expect(screen.getByText(OPEN_COPY.notOpenBody)).toBeTruthy()
    const bars = screen.getAllByRole('progressbar')
    expect(bars.map((b) => [b.getAttribute('aria-valuenow'), b.getAttribute('aria-valuemax')])).toEqual([['12', '100'], ['340', '1000']])
    expect(screen.getByText('12 of 100')).toBeTruthy()
    expect(screen.getByText('340 of 1,000')).toBeTruthy()
    expect(screen.getByRole('heading', { name: OPEN_COPY.share('Lake Tahoe') })).toBeTruthy()
    expect(screen.getByRole('button', { name: OPEN_COPY.shareButton })).toBeTruthy()
  })

  it('an open market shows no counts, just the way in', async () => {
    market.mockResolvedValue({ key: 'sacramento', name: 'Sacramento', open: true, makers: { count: 0, goal: 50 }, supporters: { count: 0, goal: 250 } })
    await page('sacramento')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(OPEN_COPY.open('Sacramento'))
    expect(screen.queryAllByRole('progressbar')).toEqual([])
    expect(screen.getByRole('link', { name: OPEN_COPY.join }).getAttribute('href')).toBe('/auth/login')
  })

  it('a bar never runs past full', async () => {
    market.mockResolvedValue({ key: 'tahoe', name: 'Lake Tahoe', open: false, makers: { count: 140, goal: 100 }, supporters: { count: 0, goal: 1000 } })
    const { container } = await page('tahoe')
    expect((container.querySelector('[role=progressbar] > div') as HTMLElement).style.width).toBe('100%')
  })

  it('an unknown market is not found', async () => {
    market.mockResolvedValue(null)
    await expect(page('atlantis')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
