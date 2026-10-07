// #413 review — Escape closes the suggestions, not the sheet around them (WAI-ARIA combobox).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { Typeahead } from './Typeahead'

afterEach(cleanup)

const setup = () => {
  const outer = vi.fn()
  render(
    <div onKeyDown={(e) => e.key === 'Escape' && outer()}>
      <Typeahead<string>
        label="Or type a neighbourhood"
        minChars={2}
        search={async () => ['Curtis Park']}
        optionKey={(o) => o}
        optionLabel={(o) => o}
        onPick={vi.fn()}
      />
    </div>,
  )
  return { outer, field: screen.getByRole('combobox', { name: /neighbourhood/i }) }
}

describe('Typeahead — Escape', () => {
  it('with suggestions open, Escape closes them and goes no further', async () => {
    const { outer, field } = setup()
    fireEvent.change(field, { target: { value: 'Curt' } })
    await screen.findByRole('option', { name: 'Curtis Park' })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(outer).not.toHaveBeenCalled()
  })

  it('with nothing open, Escape passes on, so the sheet closes as usual', () => {
    const { outer, field } = setup()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(outer).toHaveBeenCalledTimes(1)
  })
})
