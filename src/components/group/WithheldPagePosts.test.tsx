// F093 criterion 9 — the Page, as a signed-out visitor who tapped a card sees
// it.
//
// "Lands on a page that resolves. The Page renders, the withheld card for that
// announcement is present and identifiable as the one they tapped, and the CTA
// is on it. No 404, no blank Announcements section, and no silent scroll to
// nothing."

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { WithheldPagePosts } from './WithheldPagePosts'
import { mapWithheldRow } from '@/lib/feed/withheld-announcements'

const row = (id: string, count = 3) =>
  mapWithheldRow({
    result_id: id,
    group_id: 'g-1',
    slug: 'sacriver-floaters',
    name: 'SacRiver Floaters',
    public_id: '3k8x0p',
    announcement_count: count,
    updated_at: '2026-09-23T16:00:00.000Z',
  })

const POSTS = [row('p-1'), row('p-2')]

beforeEach(() => {
  window.location.hash = ''
  // jsdom has no layout, so scrollIntoView does not exist on the element.
  // The component calls it optionally for exactly this reason — the MARK is
  // what identifies the announcement and the scroll is an aid.
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
    render(<WithheldPagePosts posts={POSTS} />)
    expect(screen.getByTestId('page-posts-withheld')).toBeInTheDocument()
    expect(screen.getByText('Announcements')).toBeInTheDocument()
  })

  it('renders nothing at all when the Page has no announcements', () => {
    // A heading over an empty list tells a stranger less than no heading, and
    // it is what a signed-out visitor sees on most Pages.
    const { container } = render(<WithheldPagePosts posts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('gives each announcement the anchor the feed links to', () => {
    render(<WithheldPagePosts posts={POSTS} />)
    expect(document.getElementById('announcement-p-1')).not.toBeNull()
    expect(document.getElementById('announcement-p-2')).not.toBeNull()
  })

  it('marks the one the visitor tapped', async () => {
    window.location.hash = '#announcement-p-2'
    render(<WithheldPagePosts posts={POSTS} />)
    await waitFor(() =>
      expect(document.getElementById('announcement-p-2')).toHaveAttribute(
        'data-highlighted',
        'true',
      ),
    )
    expect(document.getElementById('announcement-p-1')).not.toHaveAttribute('data-highlighted')
  })

  it('marks nothing when the visitor arrived without a fragment', async () => {
    render(<WithheldPagePosts posts={POSTS} />)
    await waitFor(() => expect(screen.getAllByTestId('page-post-withheld')).toHaveLength(2))
    expect(document.querySelector('[data-highlighted="true"]')).toBeNull()
  })

  it('puts the ask on the announcement', () => {
    render(<WithheldPagePosts posts={[row('p-1')]} />)
    expect(screen.getByTestId('withheld-cta')).toBeInTheDocument()
  })

  it('says nothing about what the announcement says, when, or where', () => {
    const { container } = render(<WithheldPagePosts posts={[row('p-1')]} />)
    expect(container.textContent).toBe(
      'AnnouncementsPosted an announcement3 announcements this weekBecome a member to read it',
    )
  })
})
