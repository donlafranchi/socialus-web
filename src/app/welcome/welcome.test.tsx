// A member's first sign-up ends on a one-time welcome built from the live landing copy (Don, 2026-10-31).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { HOME } from '@/lib/home-landing'

const { getUser, updateUser } = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser, updateUser } })) }))
vi.mock('next/font/local', () => ({ default: () => ({ variable: '--font-landing', className: 'aime' }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import WelcomePage from './page'
import { markWelcomedAction } from './actions'
import { navHidden } from '@/components/shell/nav-hidden'

beforeEach(() => {
  vi.clearAllMocks()
  updateUser.mockResolvedValue({ data: {}, error: null })
})
afterEach(cleanup)

const open = (next?: string) => WelcomePage({ searchParams: Promise.resolve(next ? { next } : {}) })

describe('/welcome', () => {
  it('shows the landing headline, the three blocks and Get started into the app', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'm1', user_metadata: { onboarded: true } } } })
    render(await open('/g/81bjk0'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(HOME.hero.lines.join(''))
    for (const c of HOME.can) expect(screen.getByRole('heading', { name: c.title })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/g/81bjk0')
  })

  it('Get started goes to Explore when nothing was being opened, and never off-site', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'm1', user_metadata: {} } } })
    render(await open('https://evil.example'))
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/explore')
  })

  it('shows once: a member already welcomed goes straight on', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'm1', user_metadata: { welcomed: true } } } })
    await expect(open('/explore')).rejects.toThrow('REDIRECT:/explore')
  })

  it('signed out, it is not a page', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(open()).rejects.toThrow('REDIRECT:/')
  })

  it('marks the login welcomed', async () => {
    await markWelcomedAction()
    expect(updateUser).toHaveBeenCalledWith({ data: { welcomed: true } })
  })

  it('carries no app nav', () => {
    expect(navHidden('/welcome')).toBe(true)
  })
})
