// Issue #185 — the owner bar's Announce button pointed at a fragment that
// nothing on the page carried, so the primary call-to-action on your own Page
// scrolled nowhere.
//
// The two ends were written three PRs apart: OwnerBar's link landed with #175,
// the composer it points at with #179. Nothing compared them, because a dead
// fragment is not an error anywhere — the browser resolves it to nothing and
// says so to no one.
//
// So this test resolves the link the way a browser would: it renders the owner
// bar, takes the fragment out of the real href, renders the composer, and asks
// the document for that id. An assertion on the constant alone would pass with
// both ends wrong in the same way.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { OwnerBar } from './OwnerBar'
import { PagePosts } from './PagePosts'

vi.mock('@/app/_actions/location-actions', () => ({ searchPlacesAction: vi.fn() }))
vi.mock('@/lib/geocoding', () => ({
  geocode: vi.fn(async () => []),
  GeocodingUnavailableError: class extends Error {},
}))

afterEach(cleanup)

describe('the Announce button', () => {
  it('points at something that is actually on the Page', () => {
    render(<OwnerBar pagePath="/g/oak-park-sourdough-7k3x8m" />)
    const href = screen.getByTestId('owner-announce').getAttribute('href') ?? ''
    const [, fragment] = href.split('#')

    expect(fragment, 'the Announce button links to a bare page with no fragment').toBeTruthy()

    render(
      <PagePosts
        groupId="g1"
        posts={[]}
        canPost
        followerCount={0}
        onPost={vi.fn(async () => ({ ok: true as const, data: { postId: 'p', createdAt: '' } }))}
        onEdit={vi.fn(async () => ({ ok: true as const, data: { postId: 'p' } }))}
        onCreateLocation={vi.fn(async () => ({ ok: true as const, data: { id: 'l', label: 'x' } }))}
      />,
    )

    expect(
      document.getElementById(fragment),
      `nothing on the Page carries id="${fragment}", so the button scrolls nowhere`,
    ).not.toBeNull()
  })

  it('lands on the composer itself, open, not merely somewhere on the page', async () => {
    render(<OwnerBar pagePath="/g/x-abc123" />)
    const fragment = (screen.getByTestId('owner-announce').getAttribute('href') ?? '').split('#')[1]
    window.history.replaceState(null, '', `/g/x-abc123#${fragment}`)

    render(
      <PagePosts
        groupId="g1"
        posts={[]}
        canPost
        followerCount={0}
        onPost={vi.fn(async () => ({ ok: true as const, data: { postId: 'p', createdAt: '' } }))}
        onEdit={vi.fn(async () => ({ ok: true as const, data: { postId: 'p' } }))}
        onCreateLocation={vi.fn(async () => ({ ok: true as const, data: { id: 'l', label: 'x' } }))}
      />,
    )

    const target = document.getElementById(fragment!)
    expect(target).not.toBeNull()
    expect(target).toContainElement(await screen.findByTestId('page-post-body'))
    window.history.replaceState(null, '', '/')
  })

  it('opens the composer when tapped on the Page itself, where the fragment change fires no hashchange (#547)', async () => {
    window.history.replaceState(null, '', '/g/x-abc123')
    render(<OwnerBar pagePath="/g/x-abc123" />)
    render(
      <PagePosts
        groupId="g1"
        posts={[]}
        canPost
        followerCount={0}
        onPost={vi.fn(async () => ({ ok: true as const, data: { postId: 'p', createdAt: '' } }))}
        onEdit={vi.fn(async () => ({ ok: true as const, data: { postId: 'p' } }))}
        onCreateLocation={vi.fn(async () => ({ ok: true as const, data: { id: 'l', label: 'x' } }))}
      />,
    )
    expect(screen.queryByTestId('page-post-body')).toBeNull()
    const link = screen.getByTestId('owner-announce')
    // What next/link does on a same-page fragment: no browser navigation, so no hashchange.
    link.addEventListener('click', (e) => {
      e.preventDefault()
      window.history.pushState(null, '', link.getAttribute('href'))
    })
    fireEvent.click(link)
    expect(await screen.findByTestId('page-post-body')).toBeInTheDocument()
  })
})
