// #317 — on a laptop or desktop: a calendar popover for the date and a
// typeable time with 15-minute slots. Touch devices keep the native pickers.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { DateField, TimeField, parseTime } from './DateTimeFields'

const desktop = (on: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: on, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(() => desktop(true))
afterEach(cleanup)

describe('#317 — DateField', () => {
  it('on touch, is the native date picker', () => {
    desktop(false)
    render(<DateField label="Date" value="2026-10-09" min="2026-10-02" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Date')).toHaveAttribute('type', 'date')
  })

  it('on desktop, shows the date and opens a calendar', () => {
    render(<DateField label="Date" value="2026-10-09" min="2026-10-02" onChange={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /date/i })
    expect(btn).toHaveTextContent('Fri, Oct 9, 2026')
    fireEvent.click(btn)
    expect(screen.getByRole('dialog', { name: /choose a date/i })).toBeInTheDocument()
    expect(screen.getByRole('grid')).toBeInTheDocument()
  })

  it('picking a day sets it and closes', () => {
    const onChange = vi.fn()
    render(<DateField label="Date" value="2026-10-09" min="2026-10-02" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /date/i }))
    fireEvent.click(within(screen.getByRole('grid')).getByRole('button', { name: /october 14/i }))
    expect(onChange).toHaveBeenCalledWith('2026-10-14')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('days before the earliest date cannot be picked, and Escape closes', () => {
    render(<DateField label="Date" value="2026-10-09" min="2026-10-02" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /date/i }))
    expect(within(screen.getByRole('grid')).getByRole('button', { name: /october 1st|october 1,|october 1 /i })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('#317 — TimeField', () => {
  it('on touch, is the native time picker', () => {
    desktop(false)
    render(<TimeField label="Starts" value="15:00" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Starts')).toHaveAttribute('type', 'time')
  })

  it('on desktop, is a typeable field showing the time the way people say it', () => {
    render(<TimeField label="Starts" value="15:00" onChange={vi.fn()} />)
    const box = screen.getByRole('combobox', { name: 'Starts' })
    expect(box).toHaveValue('3:00 PM')
  })

  it('offers 15-minute slots and sets the one chosen', () => {
    const onChange = vi.fn()
    render(<TimeField label="Starts" value="15:00" onChange={onChange} />)
    const box = screen.getByRole('combobox', { name: 'Starts' })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    const list = screen.getByRole('listbox')
    expect(within(list).getAllByRole('option')).toHaveLength(96)
    fireEvent.click(within(list).getByRole('option', { name: '3:15 PM' }))
    expect(onChange).toHaveBeenCalledWith('15:15')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('takes a typed time', () => {
    const onChange = vi.fn()
    render(<TimeField label="Starts" value="15:00" onChange={onChange} />)
    const box = screen.getByRole('combobox', { name: 'Starts' })
    fireEvent.change(box, { target: { value: '7:30pm' } })
    fireEvent.blur(box)
    expect(onChange).toHaveBeenCalledWith('19:30')
  })

  it('keeps the last good time when what was typed is not one', () => {
    const onChange = vi.fn()
    render(<TimeField label="Starts" value="15:00" onChange={onChange} />)
    const box = screen.getByRole('combobox', { name: 'Starts' })
    fireEvent.change(box, { target: { value: 'teatime' } })
    fireEvent.blur(box)
    expect(onChange).not.toHaveBeenCalled()
    expect(box).toHaveValue('3:00 PM')
  })

  it('reads the ways people type a time', () => {
    expect(parseTime('7pm')).toBe('19:00')
    expect(parseTime('7:30 PM')).toBe('19:30')
    expect(parseTime('19:30')).toBe('19:30')
    expect(parseTime('12am')).toBe('00:00')
    expect(parseTime('noon')).toBe('12:00')
    expect(parseTime('25:00')).toBeNull()
  })
})
