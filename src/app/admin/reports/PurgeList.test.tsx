// #491 — the irreversible step has a confirmation, unlike decide and reverse:
// where there is no reversibility, the dialog is what is left (purge-proposal).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PurgeList, type PurgeCandidate } from './PurgeList'

afterEach(cleanup)

const candidates: PurgeCandidate[] = [
  { groupId: 'g1', name: 'Slow Drift Apiary', removedAt: new Date('2026-10-05T12:00:00Z') },
  { groupId: 'g2', name: 'Two Fences Goat Dairy', removedAt: new Date('2026-10-06T12:00:00Z') },
]

describe('PurgeList', () => {
  it('lists removed photos with the Page they belong to', () => {
    render(<PurgeList candidates={candidates} onPurge={vi.fn()} />)
    expect(screen.getByText('Slow Drift Apiary')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /delete permanently/i })).toHaveLength(2)
  })

  it('says so when nothing is waiting', () => {
    render(<PurgeList candidates={[]} onPurge={vi.fn()} />)
    expect(screen.getByTestId('purge-empty')).toBeInTheDocument()
  })

  it('one tap never deletes: it asks, says there is no undo, and waits', () => {
    const onPurge = vi.fn()
    render(<PurgeList candidates={candidates} onPurge={onPurge} />)
    fireEvent.click(screen.getAllByRole('button', { name: /delete permanently/i })[0]!)
    expect(screen.getByTestId('purge-confirm')).toHaveTextContent(/can.t be undone/i)
    expect(onPurge).not.toHaveBeenCalled()
  })

  it('cancel closes the question without deleting', () => {
    const onPurge = vi.fn()
    render(<PurgeList candidates={candidates} onPurge={onPurge} />)
    fireEvent.click(screen.getAllByRole('button', { name: /delete permanently/i })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByTestId('purge-confirm')).toBeNull()
    expect(onPurge).not.toHaveBeenCalled()
  })

  it('confirming sends the Page and the reason, then shows it deleted', async () => {
    const onPurge = vi.fn(async () => {})
    render(<PurgeList candidates={candidates} onPurge={onPurge} />)
    fireEvent.click(screen.getAllByRole('button', { name: /delete permanently/i })[0]!)
    fireEvent.change(screen.getByLabelText(/why/i), { target: { value: 'illegal_content' } })
    fireEvent.click(screen.getByRole('button', { name: /^delete for good$/i }))
    await waitFor(() => expect(onPurge).toHaveBeenCalledWith({ groupId: 'g1', reasonCode: 'illegal_content' }))
    expect(await screen.findByTestId('purge-done-g1')).toBeInTheDocument()
  })

  it('"other" needs a note before it can be confirmed', async () => {
    const onPurge = vi.fn(async () => {})
    render(<PurgeList candidates={candidates} onPurge={onPurge} />)
    fireEvent.click(screen.getAllByRole('button', { name: /delete permanently/i })[0]!)
    fireEvent.change(screen.getByLabelText(/why/i), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: /^delete for good$/i }))
    expect(onPurge).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/note/i)
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'not ours to keep' } })
    fireEvent.click(screen.getByRole('button', { name: /^delete for good$/i }))
    await waitFor(() => expect(onPurge).toHaveBeenCalledWith({ groupId: 'g1', reasonCode: 'other', reasonNote: 'not ours to keep' }))
  })

  it('a failure is shown and the photo stays listed', async () => {
    const onPurge = vi.fn(async () => {
      throw new Error('The photo is still there')
    })
    render(<PurgeList candidates={candidates} onPurge={onPurge} />)
    fireEvent.click(screen.getAllByRole('button', { name: /delete permanently/i })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /^delete for good$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('still there')
    expect(screen.queryByTestId('purge-done-g1')).toBeNull()
  })
})
