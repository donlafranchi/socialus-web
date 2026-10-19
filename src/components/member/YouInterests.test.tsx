import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { YouInterests } from './YouInterests'

// #892 — the member picks interests on You: one tap adds, one tap removes, each saved as it goes.

afterEach(cleanup)

describe('#892 — interests on You', () => {
  it('offers the 12 interests with the member’s own already on', () => {
    render(<YouInterests chosen={['gardening']} onSet={vi.fn()} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(12)
    expect(screen.getByRole('checkbox', { name: 'Gardening' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Live music' })).not.toBeChecked()
  })

  it('a tap adds, another removes, each through the action', async () => {
    const onSet = vi.fn(async () => ({ ok: true as const }))
    render(<YouInterests chosen={[]} onSet={onSet} />)
    const music = screen.getByRole('checkbox', { name: 'Live music' })
    fireEvent.click(music)
    expect(music).toBeChecked()
    await waitFor(() => expect(onSet).toHaveBeenCalledWith('live-music', true))
    fireEvent.click(music)
    expect(music).not.toBeChecked()
    await waitFor(() => expect(onSet).toHaveBeenCalledWith('live-music', false))
  })

  it('puts the choice back and says so when the save fails', async () => {
    const onSet = vi.fn(async () => ({ ok: false as const, message: 'That didn’t save. Try again.' }))
    render(<YouInterests chosen={[]} onSet={onSet} />)
    const arts = screen.getByRole('checkbox', { name: 'Arts & culture' })
    fireEvent.click(arts)
    await waitFor(() => expect(arts).not.toBeChecked())
    expect(screen.getByRole('alert')).toHaveTextContent('That didn’t save. Try again.')
  })
})
