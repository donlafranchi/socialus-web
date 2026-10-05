// #293 — editing a Page's weekly hours.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { HoursEditor } from './HoursEditor'

afterEach(cleanup)

describe('#293 — HoursEditor', () => {
  it('starts every day closed when there are no hours', () => {
    render(<HoursEditor value={null} onChange={vi.fn()} />)
    expect(screen.getAllByRole('checkbox', { checked: false })).toHaveLength(7)
  })

  it('opening a day gives it a starting range the owner can change', () => {
    const onChange = vi.fn()
    render(<HoursEditor value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /monday/i }))
    expect(onChange).toHaveBeenLastCalledWith({ mon: [{ open: '09:00', close: '17:00' }] })
  })

  it('changing a time reports the new week', () => {
    const onChange = vi.fn()
    render(<HoursEditor value={{ mon: [{ open: '09:00', close: '17:00' }] }} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/monday opens/i), { target: { value: '07:30' } })
    expect(onChange).toHaveBeenLastCalledWith({ mon: [{ open: '07:30', close: '17:00' }] })
  })

  it('closing the last open day leaves no hours at all', () => {
    const onChange = vi.fn()
    render(<HoursEditor value={{ mon: [{ open: '09:00', close: '17:00' }] }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /monday/i }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
