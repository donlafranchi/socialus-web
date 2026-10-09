import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const { staffPermissions, notFound } = vi.hoisted(() => ({
  staffPermissions: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/staff/page-guard', () => ({ staffPermissions }))

import AdminLayout from './layout'

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('/admin layout (#544)', () => {
  it('404s anyone who holds no staff permission, signed in or out', async () => {
    staffPermissions.mockResolvedValue({ memberId: 'm1', permissions: [] })
    await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_NOT_FOUND')
    staffPermissions.mockResolvedValue({ memberId: null, permissions: [] })
    await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('shows an analyst only the Metrics link', async () => {
    staffPermissions.mockResolvedValue({ memberId: 'a1', permissions: ['metrics.view'] })
    render(await AdminLayout({ children: <p>body</p> }))
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Metrics'])
    expect(screen.getByText('body')).toBeTruthy()
  })
  it('shows a moderator their screens and not Metrics or Builders', async () => {
    staffPermissions.mockResolvedValue({ memberId: 'm2', permissions: ['reports.review', 'tags.review', 'unclaimed.manage'] })
    render(await AdminLayout({ children: null }))
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Reports', 'Tags', 'Unclaimed'])
  })
})
