// #423 — the PM, 2026-10-06: the owner's Page settings card, last on the Edit
// Page: Archive, and Delete behind one confirm sheet where the Page name is
// typed exactly. Precedent: Facebook Pages, GitHub's delete repository.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageSettings } from './PageSettings'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

const onArchive = vi.fn(async (_i: unknown) => ({ ok: true as const }))
const onRestore = vi.fn(async (_i: unknown) => ({ ok: true as const }))
const onDelete = vi.fn(async (_i: unknown): Promise<{ ok: true } | { ok: false; message: string }> => ({ ok: true }))

const NOW = new Date('2026-10-06T19:00:00Z')

function renderSettings(lifecycleState: 'active' | 'archived' = 'active') {
  return render(
    <PageSettings
      groupId="g1"
      pagePath="/g/oak-park-sourdough-7k3x8m"
      name="Oak Park Sourdough"
      lifecycleState={lifecycleState}
      onArchive={onArchive}
      onRestore={onRestore}
      onDelete={onDelete}
      now={() => NOW}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('#423 — Page settings', () => {
  it('archives a live Page in one tap', async () => {
    renderSettings()
    expect(screen.getByTestId('page-settings')).toHaveTextContent('Page settings')
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(onArchive).toHaveBeenCalledWith({ groupId: 'g1', pagePath: '/g/oak-park-sourdough-7k3x8m' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('offers Restore instead on an archived Page', async () => {
    renderSettings('archived')
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith({ groupId: 'g1' }))
  })

  describe('the delete sheet', () => {
    const open = () => {
      renderSettings()
      fireEvent.click(screen.getByRole('button', { name: 'Delete Page' }))
      return screen.getByRole('dialog')
    }
    const confirm = () => screen.getByTestId('delete-page-confirm')
    const type = (v: string) => fireEvent.change(screen.getByTestId('delete-page-name'), { target: { value: v } })

    it('says what happens and until when it can be undone', () => {
      const dialog = open()
      expect(dialog).toHaveTextContent('Delete this Page?')
      expect(dialog).toHaveTextContent('October 20')
    })

    it('keeps the button off until the name is typed exactly', () => {
      open()
      expect(confirm()).toBeDisabled()
      for (const v of ['', 'oak park sourdough', 'Oak Park', 'Oak Park Sourdough ']) {
        type(v)
        expect(confirm()).toBeDisabled()
      }
      type('Oak Park Sourdough')
      expect(confirm()).toBeEnabled()
    })

    it('deletes, then goes to You', async () => {
      open()
      type('Oak Park Sourdough')
      fireEvent.click(confirm())
      await waitFor(() =>
        expect(onDelete).toHaveBeenCalledWith({ groupId: 'g1', pagePath: '/g/oak-park-sourdough-7k3x8m', confirmName: 'Oak Park Sourdough' }),
      )
      await waitFor(() => expect(push).toHaveBeenCalledWith('/you'))
    })

    it('stays open and says so when it does not go through', async () => {
      onDelete.mockResolvedValueOnce({ ok: false, message: "That didn't go through. Mind trying again?" })
      open()
      type('Oak Park Sourdough')
      fireEvent.click(confirm())
      expect(await screen.findByRole('alert')).toHaveTextContent("That didn't go through")
      expect(push).not.toHaveBeenCalled()
    })
  })
})
