// #297 — one sheet: a bottom sheet on phone, a centred dialog from 744.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { Sheet } from './Sheet'

afterEach(cleanup)

const open = (over: Partial<Parameters<typeof Sheet>[0]> = {}) =>
  render(
    <>
      <button type="button">before</button>
      <Sheet open title="Filters" onClose={vi.fn()} testId="filters" {...over}>
        <input aria-label="first" />
        <button type="button">last</button>
      </Sheet>
    </>,
  )

describe('#297 — Sheet', () => {
  it('is a labelled modal dialog', () => {
    open()
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('data-testid', 'filters')
  })

  it('renders nothing when closed', () => {
    open({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a bottom sheet on phone and a centred dialog from 744', () => {
    open()
    const panel = screen.getByRole('dialog')
    expect(panel.className).toMatch(/\bbottom-0\b/)
    expect(panel.className).toMatch(/\brounded-t-lg\b/)
    expect(panel.className).toMatch(/md:top-1\/2/)
    expect(panel.className).toMatch(/md:max-w-form/)
  })

  it('moves focus in, and closes on Escape and on the backdrop', () => {
    const onClose = vi.fn()
    open({ onClose })
    expect(screen.getByLabelText('first')).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.click(screen.getByTestId('filters-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('keeps Tab inside', () => {
    open()
    const close = screen.getByRole('button', { name: 'Close' })
    screen.getByRole('button', { name: 'last' }).focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })
    expect(close).toHaveFocus()
  })

  it('returns focus to what opened it', () => {
    const ui = (isOpen: boolean) => (
      <>
        <button type="button">opener</button>
        <Sheet open={isOpen} title="Filters" onClose={vi.fn()} testId="filters">
          <input aria-label="first" />
        </Sheet>
      </>
    )
    const { rerender } = render(ui(false))
    screen.getByRole('button', { name: 'opener' }).focus()
    rerender(ui(true))
    expect(screen.getByLabelText('first')).toHaveFocus()
    rerender(ui(false))
    expect(screen.getByRole('button', { name: 'opener' })).toHaveFocus()
  })

  it('sits on the sheet layer', () => {
    open()
    expect(screen.getByTestId('filters-backdrop').parentElement!.className).toContain('z-[var(--z-sheet)]')
  })
})
