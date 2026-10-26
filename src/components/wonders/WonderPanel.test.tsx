// F117 — a Wonder on its post card: the bar, I'm in with a size, helping in a role, the poster's view.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { WonderPanel, type WonderActions } from './WonderPanel'
import type { WonderView } from '@/lib/wonders/wonder-view'
import { COPY } from '@/lib/copy'

afterEach(cleanup)

const base: WonderView = { total: 0, threshold: 500, options: ['S', 'M', 'L'], mine: null, myOffers: [], helpers: [] }
const actions = (over: Partial<WonderActions> = {}): WonderActions => ({
  join: vi.fn(async () => ({ ok: true as const, inCount: 1 })),
  leave: vi.fn(async () => ({ ok: true as const, inCount: 0 })),
  offer: vi.fn(async () => ({ ok: true as const, offerIds: ['o1'] })),
  withdraw: vi.fn(async () => ({ ok: true as const, withdrawn: true })),
  decide: vi.fn(async () => ({ ok: true as const })),
  ...over,
})
const bar = () => screen.getByRole('progressbar')

describe('WonderPanel', () => {
  // [guards F117.3]
  it('shows the count and the threshold as a bar, full at the threshold and still counting past it', () => {
    const { rerender } = render(<WonderPanel postId="p" view={{ ...base, total: 120 }} loggedIn canManage={false} returnTo="/g/x" actions={actions()} />)
    expect(bar().getAttribute('aria-valuenow')).toBe('120')
    expect(bar().getAttribute('aria-valuemax')).toBe('500')
    expect(screen.getByTestId('wonder-count').textContent).toBe(COPY.wonderCount(120, 500))
    rerender(<WonderPanel postId="p" view={{ ...base, total: 500 }} loggedIn canManage={false} returnTo="/g/x" actions={actions()} />)
    expect((screen.getByTestId('wonder-bar-fill') as HTMLElement).style.width).toBe('100%')
    rerender(<WonderPanel postId="p" view={{ ...base, total: 612 }} loggedIn canManage={false} returnTo="/g/x" actions={actions()} />)
    expect((screen.getByTestId('wonder-bar-fill') as HTMLElement).style.width).toBe('100%')
    expect(screen.getByTestId('wonder-count').textContent).toBe(COPY.wonderCount(612, 500))
    expect(screen.getByText(COPY.wonderReached)).toBeTruthy()
  })

  // [guards F117.2 partial: the database's once-per-member rule]
  it("I'm in asks for one size, then can change it or leave", async () => {
    const a = actions()
    render(<WonderPanel postId="p" view={base} loggedIn canManage={false} returnTo="/g/x" actions={a} />)
    fireEvent.click(screen.getByRole('button', { name: COPY.wonderImIn }))
    fireEvent.click(await screen.findByRole('radio', { name: 'M' }))
    fireEvent.click(screen.getByRole('button', { name: COPY.wonderJoinSave }))
    await waitFor(() => expect(a.join).toHaveBeenCalledWith({ postId: 'p', option: 'M' }))
    expect(await screen.findByText(COPY.wonderYoureIn('M'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: COPY.wonderLeave }))
    await waitFor(() => expect(a.leave).toHaveBeenCalledWith({ postId: 'p' }))
  })

  it('signed out asks to sign in and comes back', () => {
    render(<WonderPanel postId="p" view={base} loggedIn={false} canManage={false} returnTo="/g/x" actions={actions()} />)
    expect(screen.getByRole('link', { name: COPY.wonderImIn }).getAttribute('href')).toBe('/auth/login?next=%2Fg%2Fx')
  })

  // [guards F117.5 partial: the database's role list and note length]
  it('I can help as: picks one or more roles and an optional note', async () => {
    const a = actions({ offer: vi.fn(async () => ({ ok: true as const, offerIds: ['o1', 'o2'] })) })
    render(<WonderPanel postId="p" view={base} loggedIn canManage={false} returnTo="/g/x" actions={a} />)
    fireEvent.click(screen.getByRole('button', { name: COPY.wonderHelp }))
    const sheet = await screen.findByTestId('wonder-help-sheet')
    expect(within(sheet).getAllByRole('checkbox')).toHaveLength(8)
    fireEvent.click(within(sheet).getByRole('checkbox', { name: COPY.wonderRoles.designer }))
    fireEvent.click(within(sheet).getByRole('checkbox', { name: COPY.wonderRoles.lead }))
    fireEvent.change(within(sheet).getByLabelText(COPY.wonderHelpNote), { target: { value: 'I sew.' } })
    fireEvent.click(within(sheet).getByRole('button', { name: COPY.wonderHelpSend }))
    await waitFor(() => expect(a.offer).toHaveBeenCalledWith({ postId: 'p', roles: ['lead', 'designer'], note: 'I sew.' }))
  })

  // [guards F117.6 partial: who the database lets read each offer]
  it('accepted helpers show by name and role; the poster accepts or declines each offer', async () => {
    const a = actions()
    const view: WonderView = {
      ...base,
      helpers: [{ name: 'Eve', role: 'designer' }],
      byOption: [{ option: 'S', count: 1 }, { option: 'M', count: 2 }, { option: 'L', count: 0 }],
      people: [{ name: 'Dana', option: 'S' }],
      offers: [{ id: 'o9', name: 'Dana', role: 'lead', note: 'Ran a co-op.', status: 'pending' }],
    }
    render(<WonderPanel postId="p" view={view} loggedIn canManage returnTo="/g/x" actions={a} />)
    expect(screen.getByTestId('wonder-helpers').textContent).toContain(`Eve · ${COPY.wonderRoles.designer}`)
    expect(screen.getByTestId('wonder-sizes').textContent).toContain('M: 2')
    expect(screen.queryByRole('button', { name: COPY.wonderImIn })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: COPY.wonderAccept }))
    await waitFor(() => expect(a.decide).toHaveBeenCalledWith({ offerId: 'o9', decision: 'accepted' }))
  })

  // [guards F117.4 partial: the database withholding the split from others]
  it('a visitor sees no size split and no names', () => {
    render(<WonderPanel postId="p" view={{ ...base, total: 3 }} loggedIn canManage={false} returnTo="/g/x" actions={actions()} />)
    expect(screen.queryByTestId('wonder-sizes')).toBeNull()
    expect(screen.queryByTestId('wonder-people')).toBeNull()
  })
})
