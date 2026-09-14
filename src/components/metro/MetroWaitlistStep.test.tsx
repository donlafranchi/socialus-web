// T163 (#77) — the metro + role step, and the popup that follows it.
//
// The constraints that are easy to lose in a refactor and are therefore
// asserted here rather than trusted:
//   c2  no metro is selected for them — not by default, not by nearest-match
//   c3  neither role is pre-selected
//   c7  a popup. Not a page, not a tab, not a new surface.
//   c8  one combined number; the split never appears

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MetroWaitlistStep } from './MetroWaitlistStep'

afterEach(cleanup)

const METROS = [
  { id: 'm1', name: 'Boise City-Mountain Home-Ontario, ID-OR' },
  { id: 'm2', name: 'Reno-Carson City-Gardnerville Ranchos, NV-CA' },
  { id: 'm3', name: 'Sacramento-Roseville, CA' },
]

const join = vi.fn()
const onDone = vi.fn()

beforeEach(() => {
  join.mockReset()
  onDone.mockReset()
  join.mockResolvedValue({
    open: false,
    metroName: 'Boise City-Mountain Home-Ontario, ID-OR',
    standing: { combined: 51, target: 300 },
    message: 'This metro needs 249 more people before there is enough here to be worth showing you.',
  })
})

function renderStep(over: Partial<Parameters<typeof MetroWaitlistStep>[0]> = {}) {
  return render(<MetroWaitlistStep metros={METROS} onJoin={join} onDone={onDone} {...over} />)
}

describe('picking a metro (c1, c2)', () => {
  it('offers every metro it was given', () => {
    renderStep()
    for (const m of METROS) {
      expect(screen.getByRole('option', { name: m.name })).toBeInTheDocument()
    }
  })

  it('selects no metro for them', () => {
    // Not by IP, not by a default, not by nearest-match. The control starts on
    // a placeholder that is not a metro.
    renderStep()
    const select = screen.getByRole('combobox', { name: /metro|where/i }) as HTMLSelectElement
    expect(select.value).toBe('')
    expect(METROS.map((m) => m.id)).not.toContain(select.value)
  })

  it('pre-selects neither role (c3)', () => {
    renderStep()
    for (const r of screen.getAllByRole('radio')) {
      expect(r).not.toBeChecked()
    }
  })

  it('offers exactly two roles', () => {
    renderStep()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('will not submit without both a metro and a role', () => {
    renderStep()
    fireEvent.click(screen.getByRole('button', { name: /continue|join/i }))
    expect(join).not.toHaveBeenCalled()
  })

  it('will not submit with a metro but no role', () => {
    renderStep()
    fireEvent.change(screen.getByRole('combobox', { name: /metro|where/i }), {
      target: { value: 'm1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /continue|join/i }))
    expect(join).not.toHaveBeenCalled()
  })

  it('sends the chosen metro and role', async () => {
    renderStep()
    fireEvent.change(screen.getByRole('combobox', { name: /metro|where/i }), {
      target: { value: 'm1' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /make/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue|join/i }))
    await waitFor(() => expect(join).toHaveBeenCalledWith({ metroId: 'm1', role: 'creator' }))
  })
})

describe('the popup (c7, c8)', () => {
  async function joinBoise() {
    fireEvent.change(screen.getByRole('combobox', { name: /metro|where/i }), {
      target: { value: 'm1' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /find/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue|join/i }))
    return screen.findByRole('dialog')
  }

  it('is a dialog, not a navigation', async () => {
    renderStep()
    const dialog = await joinBoise()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('shows the combined number against 300', async () => {
    renderStep()
    const dialog = await joinBoise()
    expect(dialog).toHaveTextContent('51')
    expect(dialog).toHaveTextContent('300')
  })

  it('shows the message', async () => {
    renderStep()
    const dialog = await joinBoise()
    expect(dialog).toHaveTextContent(/needs 249 more people/i)
  })

  it('never shows the creator/patron split', async () => {
    renderStep()
    const dialog = await joinBoise()
    const text = dialog.textContent ?? ''
    expect(text.toLowerCase()).not.toContain('creator')
    expect(text.toLowerCase()).not.toContain('patron')
  })

  it('shows no progress bar — a count and a message, nothing else', async () => {
    renderStep()
    const dialog = await joinBoise()
    expect(dialog.querySelector('progress')).toBeNull()
    expect(dialog.querySelector('[role="progressbar"]')).toBeNull()
  })

  it('can be dismissed, and hands control back', async () => {
    renderStep()
    await joinBoise()
    fireEvent.click(screen.getByRole('button', { name: /close|done|got it/i }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('does not appear for a metro that is already open', async () => {
    join.mockResolvedValue({ open: true, metroName: 'Sacramento-Roseville, CA', standing: { combined: 0, target: 0 }, message: '' })
    renderStep()
    fireEvent.change(screen.getByRole('combobox', { name: /metro|where/i }), {
      target: { value: 'm3' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /find/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue|join/i }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reports a failure without stranding the person', async () => {
    join.mockRejectedValue(new Error('nope'))
    renderStep()
    fireEvent.change(screen.getByRole('combobox', { name: /metro|where/i }), {
      target: { value: 'm1' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /find/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue|join/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })
})
