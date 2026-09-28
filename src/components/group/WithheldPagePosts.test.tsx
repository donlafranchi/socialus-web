// F093 criterion 9 — the Page, as a signed-out visitor who followed an
// `#announcement-<id>` link sees it: the Page renders, its one withheld card
// is present and marked as where they landed, and the ask is on it.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { WithheldPagePosts } from './WithheldPagePosts'
import { mapWithheldRow } from '@/lib/feed/withheld-announcements'

const PAGE = mapWithheldRow({
  result_id: 'p-1',
  group_id: 'g-1',
  slug: 'sacriver-floaters',
  name: 'SacRiver Floaters',
  public_id: '3k8x0p',
  photo_url: null,
  announcement_count: 3,
  announcement_ids: ['p-1', 'p-2'],
  updated_at: '2026-09-23T16:00:00.000Z',
})

beforeEach(() => {
  window.location.hash = ''
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WithheldPagePosts', () => {
  it('renders the Announcements section rather than nothing', () => {
    render(<WithheldPagePosts posts={[PAGE]} />)
    expect(screen.getByTestId('page-posts-withheld')).toBeInTheDocument()
    expect(screen.getByText('Announcements')).toBeInTheDocument()
  })

  it('renders nothing at all when the Page has no announcements', () => {
    const { container } = render(<WithheldPagePosts posts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('is one card for the Page, not one per announcement', () => {
    render(<WithheldPagePosts posts={[PAGE]} />)
    expect(screen.getAllByTestId('page-post-withheld')).toHaveLength(1)
  })

  it('answers to every announcement anchor the feed or a member might link', () => {
    render(<WithheldPagePosts posts={[PAGE]} />)
    const card = screen.getByTestId('page-post-withheld')
    expect(card.contains(document.getElementById('announcement-p-1'))).toBe(true)
    expect(card.contains(document.getElementById('announcement-p-2'))).toBe(true)
  })

  it('marks the card when the visitor arrived on an older announcement', async () => {
    window.location.hash = '#announcement-p-2'
    render(<WithheldPagePosts posts={[PAGE]} />)
    await waitFor(() =>
      expect(screen.getByTestId('page-post-withheld')).toHaveAttribute('data-highlighted', 'true'),
    )
  })

  it('marks nothing when the visitor arrived without a fragment', () => {
    render(<WithheldPagePosts posts={[PAGE]} />)
    expect(screen.getByTestId('page-post-withheld')).not.toHaveAttribute('data-highlighted')
  })

  it('puts the ask on the card, and brings them back to this Page', () => {
    render(<WithheldPagePosts posts={[PAGE]} />)
    expect(screen.getByTestId('withheld-cta').getAttribute('href')).toBe(
      '/auth/login?next=%2Fg%2Fsacriver-floaters-3k8x0p',
    )
  })

  it('says nothing about what the announcements say, when, or where', () => {
    const { container } = render(<WithheldPagePosts posts={[PAGE]} />)
    expect(container.textContent).toBe(
      'Announcements3 announcements this weekThe details are for members and followers of this Page.Sign in to become a member',
    )
  })
})
