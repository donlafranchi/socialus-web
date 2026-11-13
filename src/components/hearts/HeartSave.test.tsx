import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const setHeartAction = vi.fn()
const setSaveAction = vi.fn()
vi.mock('@/app/_actions/heart-save-actions', () => ({ setHeartAction: (i: unknown) => setHeartAction(i), setSaveAction: (i: unknown) => setSaveAction(i) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))

import { HeartButton, SaveButton } from './HeartSave'
import { resetMarks } from '@/lib/hearts/marks-store'

afterEach(cleanup)
beforeEach(() => {
  setHeartAction.mockReset().mockResolvedValue({ ok: true, on: true })
  setSaveAction.mockReset().mockResolvedValue({ ok: true, on: true })
})

const POST = '00000000-0000-4000-8000-000000000001'

// #1171 (plan #269, Don 2026-11-02): a heart and a save, as separate things; small and calm. F134: shown signed out.
describe('the heart and the save', () => {
  // F134.4 — shown signed out; a tap asks first (tests/f134-writes-ask-first.test.tsx). Hidden only while the session is read.
  it('show signed out, and hide only while the session is still being read', () => {
    act(() => resetMarks({ signedIn: false }))
    render(<><HeartButton target={{ postId: POST }} /><SaveButton postId={POST} /></>)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    cleanup()
    act(() => resetMarks({ signedIn: null }))
    render(<><HeartButton target={{ postId: POST }} /><SaveButton postId={POST} /></>)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('a heart toggles, says whether it is on, and is kept by the server', async () => {
    act(() => resetMarks({ signedIn: true }))
    render(<HeartButton target={{ postId: POST }} />)
    const heart = screen.getByRole('button', { name: 'Heart this post' })
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(heart)
    expect(heart).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(setHeartAction).toHaveBeenCalledWith({ postId: POST, on: true }))
  })

  it('a heart on a Page names the Page', () => {
    act(() => resetMarks({ signedIn: true }))
    render(<HeartButton target={{ groupId: POST }} />)
    expect(screen.getByRole('button', { name: 'Heart this Page' })).toBeInTheDocument()
  })

  it('a save toggles separately from the heart', async () => {
    act(() => resetMarks({ signedIn: true, savedPosts: new Set([POST]) }))
    render(<><HeartButton target={{ postId: POST }} /><SaveButton postId={POST} /></>)
    expect(screen.getByRole('button', { name: 'Save this post' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Heart this post' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Save this post' }))
    await waitFor(() => expect(setSaveAction).toHaveBeenCalledWith({ postId: POST, on: false }))
    expect(setHeartAction).not.toHaveBeenCalled()
  })

  it('goes back if the server refuses, and asks for sign-in when the session has ended', async () => {
    act(() => resetMarks({ signedIn: true }))
    setHeartAction.mockResolvedValue({ ok: false, signedOut: true })
    render(<HeartButton target={{ postId: POST }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Heart this post' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Heart this post' })).toHaveAttribute('aria-pressed', 'false'))
    expect(screen.getByText('Sign in to heart this')).toBeInTheDocument()
  })

  it('are 44px tap targets and count as a save on a shelf when turned on', () => {
    act(() => resetMarks({ signedIn: true }))
    render(<><HeartButton target={{ postId: POST }} /><SaveButton postId={POST} /></>)
    for (const b of screen.getAllByRole('button')) {
      expect(b.className).toMatch(/size-tap/)
      expect(b).toHaveAttribute('data-shelf-save')
    }
  })
})
