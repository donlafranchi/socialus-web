// #1183 — posts from members get rows of their own in Explore and one group in search.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemberPostRows } from './MemberPostRows'
import type { MemberPost } from '@/lib/member-posts/read'

afterEach(cleanup)

const now = new Date('2026-11-05T20:00:00Z')
const post = (id: string, over: Partial<MemberPost> = {}): MemberPost => ({
  id, kind: 'lost_found', body: 'Grey cat, white paws.', placeName: 'Curtis Park', saleOn: null, street: null,
  createdAt: '2026-11-03T18:00:00Z', expiresAt: '2026-11-10T18:00:00Z', labels: [], labelsPinned: false,
  displayName: 'Rosa P', avatarUrl: null, mine: false, ended: false, answered: false, answers: null, ...over,
})

describe('#1183 — MemberPostRows', () => {
  it('one row per kind under From neighbors, leaving out a kind with none', () => {
    render(<MemberPostRows now={now} posts={[post('a'), post('b', { kind: 'ask', body: 'A good tailor?' })]} />)
    expect(screen.getByRole('heading', { name: 'From neighbors' })).toBeInTheDocument()
    expect(within(screen.getByTestId('member-posts-lost_found')).getAllByTestId('member-post-card')).toHaveLength(1)
    expect(screen.getByTestId('member-posts-ask')).toBeInTheDocument()
    expect(screen.queryByTestId('member-posts-free_sale')).toBeNull()
  })

  it('a card is signed with display name and neighborhood, and opens the post, never a profile', () => {
    render(<MemberPostRows now={now} posts={[post('a')]} />)
    const card = screen.getByTestId('member-post-card')
    expect(card).toHaveAttribute('href', '/neighbors/a')
    expect(within(card).getByTestId('member-post-lead')).toHaveTextContent('Lost & found · 2 days ago · Curtis Park')
    expect(within(card).getByTestId('member-post-name')).toHaveTextContent('Rosa P')
    expect(within(card).queryAllByRole('link')).toHaveLength(0)
  })

  it('in search, one labelled group', () => {
    render(<MemberPostRows now={now} byKind={false} posts={[post('a'), post('b', { kind: 'ask' })]} />)
    expect(within(screen.getByTestId('member-posts-search')).getAllByTestId('member-post-card')).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'From neighbors' })).toBeInTheDocument()
  })

  it('nothing at all when there are none', () => {
    const { container } = render(<MemberPostRows now={now} posts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
