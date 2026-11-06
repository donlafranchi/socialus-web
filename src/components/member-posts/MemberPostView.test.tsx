// #1183 — one post from a member: signed, answered without comments, reportable, and taken down by its poster.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemberPostView } from './MemberPostView'
import type { MemberPost } from '@/lib/member-posts/read'

afterEach(cleanup)

const now = new Date('2026-11-05T20:00:00Z')
const post = (over: Partial<MemberPost> = {}): MemberPost => ({
  id: 'p1', kind: 'lost_found', body: 'Grey cat, white paws.', placeName: 'Curtis Park', saleOn: null, street: null,
  createdAt: '2026-11-03T18:00:00Z', expiresAt: '2026-11-10T18:00:00Z', labels: ['Neighborhood life'], labelsPinned: false,
  displayName: 'Rosa P', avatarUrl: null, mine: false, ended: false, answered: false, answers: null, ...over,
})
const noop = { onAnswer: vi.fn(), onWithdraw: vi.fn(), onReport: vi.fn() }

describe('#1183 — MemberPostView', () => {
  it('signed with display name and neighborhood, and the name is not a link', () => {
    render(<MemberPostView post={post()} now={now} {...noop} />)
    expect(screen.getByTestId('member-post-lead')).toHaveTextContent('Lost & found · 2 days ago · Curtis Park')
    expect(screen.getByTestId('member-post-name')).toHaveTextContent('Rosa P')
    expect(screen.getByText('in Curtis Park')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Rosa P/ })).toBeNull()
    expect(screen.getByTestId('member-post-labels')).toHaveTextContent('Listed under Neighborhood life')
  })

  it('one answer in place of comments: I saw it, which toggles', async () => {
    const onAnswer = vi.fn().mockResolvedValue({ ok: true, on: true })
    render(<MemberPostView post={post()} now={now} {...noop} onAnswer={onAnswer} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'I saw it' }))
    await waitFor(() => expect(screen.getByTestId('member-post-answer')).toHaveAttribute('aria-pressed', 'true'))
    expect(onAnswer).toHaveBeenCalledWith(true)
  })

  it('Free / for sale and Ask a neighbor answer I’m interested', () => {
    render(<MemberPostView post={post({ kind: 'free_sale' })} now={now} {...noop} />)
    expect(screen.getByRole('button', { name: 'I’m interested' })).toBeInTheDocument()
  })

  it('a yard sale shows its day and street', () => {
    render(<MemberPostView post={post({ kind: 'free_sale', saleOn: '2026-11-07', street: '2700 Portola Way' })} now={now} {...noop} />)
    expect(screen.getByTestId('member-post-sale')).toHaveTextContent('Sat, Nov 7 · 2700 Portola Way')
  })

  it('a reader can report it', () => {
    render(<MemberPostView post={post()} now={now} {...noop} />)
    expect(screen.getByRole('button', { name: /more|options|⋯|report/i })).toBeInTheDocument()
  })

  it('its poster sees who answered, by name, and can take it down; never their own report or answer', async () => {
    const onWithdraw = vi.fn().mockResolvedValue({ ok: true })
    render(<MemberPostView post={post({ mine: true, answers: [{ displayName: 'Sam K', at: '2026-11-04T10:00:00Z' }] })} now={now} {...noop} onWithdraw={onWithdraw} />)
    expect(screen.getByTestId('member-post-answers')).toHaveTextContent('Sam K')
    expect(screen.queryByTestId('member-post-answer')).toBeNull()
    expect(screen.queryByRole('button', { name: /more|options|⋯|report/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Take it down' }))
    expect(await screen.findByTestId('member-post-ended')).toHaveTextContent('Only you can see it.')
  })
})
