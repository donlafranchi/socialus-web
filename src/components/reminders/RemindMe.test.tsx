// #945 — Remind me on a dated post, and Remind me every time on a Page that repeats.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { RemindMeButton, RemindEveryTimeButton } from './RemindMe'

afterEach(cleanup)

const ok = (reminderId = 'r1') => vi.fn(async () => ({ ok: true as const, reminderId }))
const removed = () => vi.fn(async () => ({ ok: true as const }))

describe('RemindMeButton', () => {
  it('a one-off post: one tap reminds, and says so', async () => {
    const set = ok()
    render(<RemindMeButton postId="p1" repeats={false} reminderId={null} loggedIn returnTo="/g/x" actions={{ set, remove: removed() }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reminder on' })).toBeTruthy())
    expect(set).toHaveBeenCalledWith({ postId: 'p1', every: false })
    expect(screen.getByRole('status').textContent).toBe('We’ll remind you.')
  })
  it('a post that repeats: asks just this one or every time', async () => {
    const set = ok()
    render(<RemindMeButton postId="p1" repeats reminderId={null} loggedIn returnTo="/g/x" actions={{ set, remove: removed() }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }))
    expect(set).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Every time' }))
    await waitFor(() => expect(set).toHaveBeenCalledWith({ postId: 'p1', every: true }))
    expect(screen.queryByRole('button', { name: 'Just this one' })).toBeNull()
  })
  it('a reminder that is on: one tap removes it', async () => {
    const remove = removed()
    render(<RemindMeButton postId="p1" repeats={false} reminderId="r9" loggedIn returnTo="/g/x" actions={{ set: ok(), remove }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reminder on' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remind me' })).toBeTruthy())
    expect(remove).toHaveBeenCalledWith('r9')
  })
  it('signed out: asks to sign in and comes back here', () => {
    render(<RemindMeButton postId="p1" repeats={false} reminderId={null} loggedIn={false} returnTo="/g/x" actions={{ set: ok(), remove: removed() }} />)
    expect(screen.getByRole('link', { name: 'Remind me' }).getAttribute('href')).toBe('/auth/login?next=%2Fg%2Fx')
  })
  it('a refusal says so and stays off', async () => {
    const set = vi.fn(async () => ({ ok: false as const }))
    render(<RemindMeButton postId="p1" repeats={false} reminderId={null} loggedIn returnTo="/g/x" actions={{ set, remove: removed() }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('That didn’t save. Mind trying again?'))
    expect(screen.getByRole('button', { name: 'Remind me' })).toBeTruthy()
  })
})

describe('RemindEveryTimeButton', () => {
  it('one tap reminds every time, then says so', async () => {
    const everyForPage = vi.fn(async () => ({ ok: true as const, added: 1 }))
    render(<RemindEveryTimeButton groupId="g1" on={false} everyForPage={everyForPage} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remind me every time' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('We’ll remind you.'))
    expect(everyForPage).toHaveBeenCalledWith('g1')
    expect(screen.queryByRole('button', { name: 'Remind me every time' })).toBeNull()
  })
  it('already on: nothing to offer', () => {
    render(<RemindEveryTimeButton groupId="g1" on everyForPage={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
