import { emptyWhere } from '@/components/locations/WhereFields'
// #369 — the owner's tools (owner-page-spec, dispatch 2026-10-05): the Page as
// people see it, then Tell people, People, Add to your Page, Settings. A bar
// with sheets under 1280; a panel from 1280.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { OwnerBar, OwnerPanel } from './OwnerTools'
import { PageEditorProvider } from './edit/PageEditor'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
const EDITOR = {
  groupId: 'g1', pagePath: '/g/x', memberId: 'm1', name: 'N', description: '', photoUrl: null,
  socialLinks: {}, tags: ['t'], contact: { phone: null, hours: null }, contactOn: true, addressLabel: null, kind: 'business' as const, useCase: 'selling' as const, productsOn: true, where: emptyWhere,
}
const withEditor = (ui: ReactNode) =>
  render(<PageEditorProvider initial={EDITOR} onSave={async () => ({ ok: true })}>{ui}</PageEditorProvider>)

afterEach(cleanup)

describe('the panel, from 1280', () => {
  it('has the four groups, in order', () => {
    withEditor(<OwnerPanel pagePath="/g/x" followerCount={3} />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Tell people', 'People', 'Add to your Page', 'Settings'])
  })

  it('People says how many follow, in words when nobody does', () => {
    withEditor(<OwnerPanel pagePath="/g/x" followerCount={3} />)
    expect(screen.getByText('3 following your Page')).toBeInTheDocument()
    cleanup()
    withEditor(<OwnerPanel pagePath="/g/x" followerCount={0} />)
    expect(screen.getByText('Nobody follows your Page yet')).toBeInTheDocument()
  })

  it('Settings opens the type of Page', () => {
    withEditor(<OwnerPanel pagePath="/g/x" followerCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Type of Page' }))
    expect(screen.getByRole('dialog', { name: 'Type of Page' })).toBeInTheDocument()
  })
})

describe('the bar, under 1280', () => {
  it('New post, People, Add and Settings; New post is not a second primary', () => {
    withEditor(<OwnerBar pagePath="/g/x" followerCount={0} />)
    const bar = screen.getByRole('toolbar', { name: /your page/i })
    expect(within(bar).getByTestId('owner-announce')).toHaveTextContent('New post')
    expect(within(bar).getByTestId('owner-announce').className).not.toMatch(/btn-primary/)
    for (const name of ['People', 'Add', 'Settings']) expect(within(bar).getByRole('button', { name })).toBeInTheDocument()
  })

  it('each opens its group in a sheet', () => {
    withEditor(<OwnerBar pagePath="/g/x" followerCount={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'People' }))
    expect(screen.getByRole('dialog', { name: 'People' })).toHaveTextContent('2 following your Page')
  })

  it('Add opens what the Page shows', () => {
    withEditor(<OwnerBar pagePath="/g/x" followerCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'What your Page shows' }))
    expect(screen.getByRole('dialog', { name: 'What your Page shows' })).toBeInTheDocument()
  })

  // Don, 2026-10-05: products, services and gatherings are added from the Page; for beta, a dated Post or a Post.
  it('Add offers an event and a post, each opening the Page\'s composer; the event with its date showing', async () => {
    const addWhen = vi.fn()
    document.body.insertAdjacentHTML('beforeend', '<button data-testid="announce-add-when"></button><textarea id="page-post-body"></textarea>')
    document.querySelector('[data-testid="announce-add-when"]')!.addEventListener('click', addWhen)
    withEditor(<OwnerBar pagePath="/g/x" followerCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByTestId('owner-add-event')).toHaveAttribute('href', '/g/x#announce')
    expect(screen.getByTestId('owner-add-post')).toHaveAttribute('href', '/g/x#announce')
    fireEvent.click(screen.getByTestId('owner-add-event'))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(addWhen).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    document.querySelector('[data-testid="announce-add-when"]')?.remove()
    document.getElementById('page-post-body')?.remove()
  })

  it('Edit your Page closes the sheet and the bar becomes one Done', () => {
    withEditor(<OwnerBar pagePath="/g/x" followerCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit your Page' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })
})
