// #962 — the Following page's list of Pages: photo, name, town, next dated post, Remind me every time, Unfollow.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { FollowedPagesList } from './FollowedPagesList'
import type { FollowedPage } from '@/lib/follows/followed-pages'

afterEach(cleanup)

const BAKERY: FollowedPage = {
  groupId: 'g1',
  href: '/g/aaa111',
  name: 'Zest Bakery',
  photoUrl: 'https://x/z.jpg',
  town: 'Davis',
  nextPost: { id: 'p1', startsAt: '2026-10-21T16:00:00Z', title: 'Bread class' },
  repeatingSeries: ['s1'],
  everyTimeOn: false,
}
const MARKET: FollowedPage = { ...BAKERY, groupId: 'g2', href: '/g/bbb222', name: 'Arden Market', photoUrl: null, town: null, nextPost: null, repeatingSeries: [] }

const actions = () => ({
  unfollow: vi.fn().mockResolvedValue({ ok: true }),
  follow: vi.fn().mockResolvedValue({ ok: true }),
  everyForPage: vi.fn().mockResolvedValue({ ok: true, added: 1 }),
})

describe('FollowedPagesList', () => {
  it('shows each Page with its photo, name, town and next dated post, linked to the post', () => {
    render(<FollowedPagesList pages={[BAKERY, MARKET]} actions={actions()} />)
    const [first, second] = screen.getAllByTestId('followed-page')
    expect(within(first).getByRole('link', { name: 'Zest Bakery' }).getAttribute('href')).toBe('/g/aaa111')
    expect(first.querySelector('img')?.getAttribute('src')).toBe('https://x/z.jpg')
    expect(within(first).getByText('Davis')).toBeTruthy()
    expect(within(first).getByTestId('followed-next').getAttribute('href')).toBe('/g/aaa111#announcement-p1')
    expect(within(first).getByTestId('followed-next').textContent).toMatch('Bread class')
    expect(within(second).queryByTestId('followed-next')).toBeNull()
  })

  it('offers Remind me every time only on a Page with a repeating post', () => {
    render(<FollowedPagesList pages={[BAKERY, MARKET]} actions={actions()} />)
    const [first, second] = screen.getAllByTestId('followed-page')
    expect(within(first).getByRole('button', { name: /Remind me every time/ })).toBeTruthy()
    expect(within(second).queryByRole('button', { name: /Remind me every time/ })).toBeNull()
  })

  it('unfollows with Undo', async () => {
    const a = actions()
    render(<FollowedPagesList pages={[BAKERY]} actions={a} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unfollow Zest Bakery' }))
    await waitFor(() => expect(a.unfollow).toHaveBeenCalledWith({ groupId: 'g1' }))
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }))
    await waitFor(() => expect(a.follow).toHaveBeenCalledWith({ groupId: 'g1' }))
    expect(screen.getByRole('button', { name: 'Unfollow Zest Bakery' })).toBeTruthy()
  })

  it('says so, and points to Explore, when nothing is followed', () => {
    render(<FollowedPagesList pages={[]} actions={actions()} />)
    expect(screen.getByTestId('followed-pages-empty').textContent).toMatch(/not following any Pages yet/i)
    expect(screen.getByRole('link', { name: /Explore/ }).getAttribute('href')).toBe('/explore')
  })
})
