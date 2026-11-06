import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SavedList } from './SavedList'
import { NO_REMINDERS } from '@/lib/reminders/viewer-reminders'
import type { SavedPost } from '@/lib/hearts/saved-posts'

afterEach(cleanup)

const post = (over: Partial<SavedPost>): SavedPost => ({
  postId: 'p', href: '/x/p', pageName: 'Corner Bakery', headline: 'Bread is back', body: 'Bread is back', kind: 'event',
  startsAt: null, endsAt: null, where: null, seriesId: null, savedAt: '2026-11-01T00:00:00Z', past: false, ...over,
})
const remind = { set: vi.fn(async () => ({ ok: true as const, reminderId: 'r' })), remove: vi.fn(async () => ({ ok: true })) }

// #1171 (plan #269, Don 2026-11-02) — saved posts: upcoming first with Remind me; past ones at the end.
describe('the Saved list', () => {
  it('offers Remind me on an upcoming dated post only, and drops past ones to the end under their own heading', () => {
    render(
      <SavedList
        posts={[post({ postId: 'soon', startsAt: '2099-01-01T00:00:00Z' }), post({ postId: 'any', headline: 'Open daily' }), post({ postId: 'over', startsAt: '2020-01-01T00:00:00Z', past: true })]}
        reminders={NO_REMINDERS}
        remind={remind}
        unsave={vi.fn()}
      />,
    )
    const current = within(screen.getByTestId('saved-current')).getAllByTestId('saved-post')
    expect(current).toHaveLength(2)
    expect(within(current[0]!).getByRole('button', { name: /remind me/i })).toBeInTheDocument()
    expect(within(current[1]!).queryByRole('button', { name: /remind me/i })).toBeNull()
    const past = screen.getByTestId('saved-past')
    expect(past).toHaveTextContent('Already happened')
    expect(within(past).queryByRole('button', { name: /remind me/i })).toBeNull()
  })

  it('removes a post at once, and brings it back if the server says no', async () => {
    const unsave = vi.fn(async () => ({ ok: false }))
    render(<SavedList posts={[post({})]} reminders={NO_REMINDERS} remind={remind} unsave={unsave} />)
    fireEvent.click(screen.getByTestId('saved-remove'))
    expect(unsave).toHaveBeenCalledWith({ postId: 'p', on: false })
    await waitFor(() => expect(screen.getByTestId('saved-post')).toBeInTheDocument())
  })

  it('says what to do when nothing is saved', () => {
    render(<SavedList posts={[]} reminders={NO_REMINDERS} remind={remind} unsave={vi.fn()} />)
    expect(screen.getByTestId('saved-empty')).toHaveTextContent(/Tap the bookmark on a post/)
  })
})
