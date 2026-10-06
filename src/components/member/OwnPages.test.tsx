// #423 — You → your Pages is where an archived or deleted Page comes back.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { OwnPage } from '@/lib/member/own-pages'

const { getOwnPages } = vi.hoisted(() => ({ getOwnPages: vi.fn() }))
vi.mock('@/lib/member/own-pages', () => ({ getOwnPages }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/app/_actions/page-lifecycle-actions', () => ({ restorePageAction: vi.fn() }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { OwnPages } from './OwnPages'

const page = (over: Partial<OwnPage>): OwnPage => ({
  groupId: 'g1',
  name: 'Oak Park Sourdough',
  slug: 'oak-park-sourdough',
  kind: 'business',
  category: null,
  description: null,
  photoUrl: null,
  location: { scale: 'none' },
  lifecycleState: 'active',
  deleteAfter: null,
  href: '/g/oak-park-sourdough-7k3x8m',
  ...over,
})

const onRestore = vi.fn(async (_i: unknown): Promise<{ ok: true } | { ok: false; message: string }> => ({ ok: true }))

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('#423 — restoring from You', () => {
  it('shows an archived Page as archived, with Restore', async () => {
    getOwnPages.mockResolvedValue([page({ lifecycleState: 'archived' })])
    render(<OwnPages memberId="m1" onRestore={onRestore} />)
    const state = await screen.findByTestId('own-page-archived')
    expect(state).toHaveTextContent('Archived · Only you can see this')
    expect(screen.getByRole('button', { name: 'Restore Oak Park Sourdough' })).toBeInTheDocument()
  })

  it('shows a deleted Page with the date it can be restored until', async () => {
    getOwnPages.mockResolvedValue([page({ lifecycleState: 'dissolved', deleteAfter: '2026-10-20T19:00:00Z', href: null })])
    render(<OwnPages memberId="m1" onRestore={onRestore} />)
    expect(await screen.findByTestId('own-page-deleted')).toHaveTextContent('Deleted · restore until October 20')
  })

  it('restores, then reads the list again', async () => {
    getOwnPages.mockResolvedValueOnce([page({ lifecycleState: 'archived' })]).mockResolvedValueOnce([page({})])
    render(<OwnPages memberId="m1" onRestore={onRestore} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Oak Park Sourdough' }))
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith({ groupId: 'g1' }))
    expect(await screen.findByTestId('own-page-live')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })

  it('says so when a restore does not go through', async () => {
    getOwnPages.mockResolvedValue([page({ lifecycleState: 'archived' })])
    onRestore.mockResolvedValueOnce({ ok: false, message: "That didn't go through. Mind trying again?" })
    render(<OwnPages memberId="m1" onRestore={onRestore} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Oak Park Sourdough' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't go through")
    expect(within(screen.getByTestId('tile-card')).getByRole('button', { name: 'Restore Oak Park Sourdough' })).toBeEnabled()
  })

  it('a live Page has no Restore', async () => {
    getOwnPages.mockResolvedValue([page({})])
    render(<OwnPages memberId="m1" onRestore={onRestore} />)
    await screen.findByTestId('own-page-live')
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull()
  })
})

describe('#423 review — Restore is a 44px target', () => {
  it('is a full-height button', async () => {
    getOwnPages.mockResolvedValue([page({ lifecycleState: 'archived' })])
    render(<OwnPages memberId="m1" onRestore={onRestore} />)
    expect(await screen.findByRole('button', { name: 'Restore Oak Park Sourdough' })).toHaveClass('min-h-tap')
  })
})
