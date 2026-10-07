// #330 — the "default metro" setting on the You page; the Explore pill follows it.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { DefaultMetro } from './DefaultMetro'

const metros = [
  { id: 'a', slug: 'sac', name: 'Sacramento-Roseville, CA' },
  { id: 'b', slug: 'pdx', name: 'Portland-Vancouver, OR-WA' },
]

afterEach(cleanup)

describe('DefaultMetro', () => {
  it('shows the current default and offers the open metros', () => {
    render(<DefaultMetro metros={metros} currentId="a" onSave={vi.fn()} />)
    const select = screen.getByLabelText('Default metro') as HTMLSelectElement
    expect(select.value).toBe('sac')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(metros.map((m) => m.name))
  })

  it('saves a change and says so', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true })
    render(<DefaultMetro metros={metros} currentId="a" onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('Default metro'), { target: { value: 'pdx' } })
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('pdx'))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('says when saving failed', async () => {
    render(<DefaultMetro metros={metros} currentId="a" onSave={vi.fn().mockResolvedValue({ ok: false })} />)
    fireEvent.change(screen.getByLabelText('Default metro'), { target: { value: 'pdx' } })
    expect(await screen.findByText('Couldn’t save. Try again.')).toBeInTheDocument()
  })

  it('with nothing set, the zip metro shown first is the one in effect', () => {
    render(<DefaultMetro metros={metros} currentId={null} onSave={vi.fn()} />)
    expect((screen.getByLabelText('Default metro') as HTMLSelectElement).value).toBe('sac')
  })
})
