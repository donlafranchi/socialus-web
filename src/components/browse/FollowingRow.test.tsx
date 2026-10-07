// T169 (#203) — F059 criterion 2b, the row itself.
//
// Two rules, and the second is the one that will be broken by accident:
//   - it HIDES when empty. Not an empty state, not a heading with nothing
//     under it, not a "nothing yet" — absent.
//   - the word is ANNOUNCEMENT. Never "post", never "bulletin". The noun was
//     ruled and Bulletins was cut, so a stray "post" in copy is a regression
//     against a decision, not a style preference.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { FollowingRow } from './FollowingRow'
import type { BrowseResult } from '@/lib/feed/browse-feed'

const result = (over: Partial<BrowseResult> = {}): BrowseResult =>
  ({
    resultKind: 'post',
    resultId: 'p-1',
    groupId: 'g-1',
    groupKind: 'community',
    slug: 'the-good-loaf',
    name: 'The Good Loaf',
    href: '/g/the-good-loaf-abc123',
    photoUrl: null,
    description: null,
    body: 'Bread is out of the oven',
    tags: [],
    startsAt: null,
    locationId: null,
    locationLabel: null,
    lat: null,
    lng: null,
    pageCreatedAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
    sortAt: '2026-09-20T00:00:00Z',
    ...over,
  }) as BrowseResult

afterEach(cleanup)

describe('empty — it hides', () => {
  it('renders nothing at all for an empty list', () => {
    const { container } = render(<FollowingRow results={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders no heading, no container, no testid', () => {
    render(<FollowingRow results={[]} />)
    expect(screen.queryByTestId('browse-following')).not.toBeInTheDocument()
    // Absence, not emptiness — a heading with nothing under it is the thing
    // criterion 2b's presentation rules out.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByText(/nothing|no announcements|yet/i)).not.toBeInTheDocument()
  })
})

describe('non-empty — it shows', () => {
  it('renders a card per announcement', () => {
    render(<FollowingRow results={[result(), result({ resultId: 'p-2', name: 'Pond Side Circle' })]} />)
    expect(screen.getByTestId('browse-following')).toBeInTheDocument()
    expect(screen.getByText('The Good Loaf')).toBeInTheDocument()
    expect(screen.getByText('Pond Side Circle')).toBeInTheDocument()
  })

  // #365 (2026-10-05) supersedes the earlier "announcement is the word": it is Post(s) now.
  it('says posts, and never announcement or bulletin', () => {
    render(<FollowingRow results={[result()]} />)
    const text = screen.getByTestId('browse-following').textContent ?? ''
    expect(text).toMatch(/\bposts\b/i)
    expect(text).not.toMatch(/announcement/i)
    expect(text).not.toMatch(/\bbulletins?\b/i)
  })

  it('is labelled for a screen reader, not just visually', () => {
    render(<FollowingRow results={[result()]} />)
    expect(screen.getByRole('region', { name: /posts from pages you follow/i })).toBeInTheDocument()
  })
})

// #270 — the row wraps each card in an <li>, and a card was itself an <li>:
// invalid nesting, and signed-in Explore failed to hydrate.
describe('FollowingRow — list structure', () => {
  it('nests no list item inside another', () => {
    const { container } = render(
      <FollowingRow results={[result({ resultId: 'a' }), result({ resultId: 'b', withheld: true, body: null })]} />,
    )
    expect(container.querySelectorAll('li li')).toHaveLength(0)
    expect(container.querySelectorAll('ul > li')).toHaveLength(2)
  })
})

// #365 — Post(s), not Announcement(s), in everything people read.
describe('#365 — the row says posts', () => {
  it('reads "Posts from Pages you follow", in its heading and its label', () => {
    render(<FollowingRow results={[result()]} />)
    expect(screen.getByRole('heading', { name: 'Posts from Pages you follow' })).toBeInTheDocument()
    expect(screen.getByTestId('browse-following')).toHaveAttribute('aria-label', 'Posts from Pages you follow')
    expect(document.body.textContent ?? '').not.toMatch(/announcement/i)
  })
})

