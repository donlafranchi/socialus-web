// #443 — /report: the form for a member, a sign-in for anyone else.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('./actions', () => ({ reportProblemAction: vi.fn() }))

import ReportPage from './page'

beforeEach(() => cleanup())

describe('/report', () => {
  it('shows a signed-in member the form, for the screen they came from', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
    render(await ReportPage({ searchParams: Promise.resolve({ from: '/g/abc123' }) }))
    expect(screen.getByTestId('report-form')).toBeInTheDocument()
  })

  it('a signed-out visitor is asked to sign in, and brought back here', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    render(await ReportPage({ searchParams: Promise.resolve({}) }))
    expect(screen.queryByTestId('report-form')).toBeNull()
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toMatch(/^\/auth\/login\?next=%2Freport/)
  })

  it('an off-site "from" is ignored', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
    const el = await ReportPage({ searchParams: Promise.resolve({ from: '//evil.example/x' }) })
    render(el)
    expect(screen.getByTestId('report-form')).toBeInTheDocument()
  })
})
