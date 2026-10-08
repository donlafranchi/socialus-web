// #423 — You → your Pages is where an archived or deleted Page comes back.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { OwnPage } from '@/lib/member/own-pages'

const { getOwnPages } = vi.hoisted(() => ({ getOwnPages: vi.fn() }))
vi.mock('@/lib/member/own-pages', () => ({ getOwnPages }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/app/_actions/page-lifecycle-actions', () => ({ restorePageAction: vi.fn(), discardDraftAction: vi.fn() }))
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
  href: '/g/7k3x8m',
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

// #463 — the PM, 2026-10-07: owners must be able to delete unpublished drafts.
describe('#463 — Unfinished Pages', () => {
  const onDiscard = vi.fn(async (_i: unknown): Promise<{ ok: true } | { ok: false; message: string }> => ({ ok: true }))
  const draft = page({ groupId: 'd1', name: 'Half-made Bakery', lifecycleState: 'draft', href: '/g/draftx' })

  it('lists drafts under "Unfinished Pages", apart from the live ones', async () => {
    getOwnPages.mockResolvedValue([page({}), draft])
    render(<OwnPages memberId="m1" onRestore={onRestore} onDiscard={onDiscard} />)
    const section = await screen.findByTestId('own-drafts')
    expect(within(section).getByRole('heading', { name: 'Unfinished Pages' })).toBeInTheDocument()
    expect(within(section).getByText('Half-made Bakery')).toBeInTheDocument()
    expect(within(section).queryByText('Oak Park Sourdough')).toBeNull()
    expect(within(screen.getByTestId('own-pages')).queryByText('Half-made Bakery')).toBeNull()
  })

  it('has no such section when there are no drafts', async () => {
    getOwnPages.mockResolvedValue([page({})])
    render(<OwnPages memberId="m1" onRestore={onRestore} onDiscard={onDiscard} />)
    await screen.findByTestId('own-pages')
    expect(screen.queryByTestId('own-drafts')).toBeNull()
  })

  it('gives each draft Continue (back to the draft) and Delete', async () => {
    getOwnPages.mockResolvedValue([draft])
    render(<OwnPages memberId="m1" onRestore={onRestore} onDiscard={onDiscard} />)
    const section = await screen.findByTestId('own-drafts')
    expect(within(section).getByRole('link', { name: /continue/i })).toHaveAttribute('href', '/g/draftx')
    expect(within(section).getByRole('button', { name: 'Delete Half-made Bakery' })).toBeInTheDocument()
  })

  it('asks first, and Keep it changes nothing', async () => {
    getOwnPages.mockResolvedValue([draft])
    render(<OwnPages memberId="m1" onRestore={onRestore} onDiscard={onDiscard} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Half-made Bakery' }))
    expect(screen.getByRole('dialog', { name: /delete this unfinished page/i })).toHaveAttribute('aria-modal', 'true')
    fireEvent.click(screen.getByRole('button', { name: /keep it/i }))
    expect(onDiscard).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Half-made Bakery')).toBeInTheDocument()
  })

  it('deletes on confirm, and the draft is gone', async () => {
    getOwnPages.mockResolvedValueOnce([draft]).mockResolvedValueOnce([])
    render(<OwnPages memberId="m1" onRestore={onRestore} onDiscard={onDiscard} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Half-made Bakery' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Page' }))
    await waitFor(() => expect(onDiscard).toHaveBeenCalledWith({ groupId: 'd1' }))
    await waitFor(() => expect(screen.queryByText('Half-made Bakery')).toBeNull())
    expect(refresh).toHaveBeenCalled()
  })

  it('says so, and keeps the draft, when it did not go through', async () => {
    onDiscard.mockResolvedValueOnce({ ok: false, message: "That didn't go through. Mind trying again?" })
    getOwnPages.mockResolvedValue([draft])
    render(<OwnPages memberId="m1" onRestore={onRestore} onDiscard={onDiscard} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Half-made Bakery' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Page' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't go through")
    expect(screen.getByText('Half-made Bakery')).toBeInTheDocument()
  })

  it('offers Delete on a draft only: a live Page keeps its Edit page', async () => {
    getOwnPages.mockResolvedValue([page({})])
    render(<OwnPages memberId="m1" onRestore={onRestore} onDiscard={onDiscard} />)
    await screen.findByTestId('own-pages')
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull()
  })
})

