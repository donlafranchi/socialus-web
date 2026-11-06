// #1180 — "Listed under: X · Change" (plan #273 B).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ListedUnder, labelsToSend, savedValue, UNPINNED } from './ListedUnder'

afterEach(cleanup)

describe('#1180 — Listed under', () => {
  it('shows the word match on what is being written', () => {
    render(<ListedUnder idPrefix="l" value={UNPINNED} onChange={() => {}} text="Sourdough back Friday" />)
    expect(screen.getByTestId('l-listed')).toHaveTextContent('Listed under: Food & drink · Bakery')
  })

  it("falls back to the Page's labels, then Neighborhood life", () => {
    render(<ListedUnder idPrefix="a" value={UNPINNED} onChange={() => {}} text="See you" pageTags={['Gardening']} />)
    expect(screen.getByTestId('a-listed')).toHaveTextContent('Listed under: Gardening')
    render(<ListedUnder idPrefix="b" value={UNPINNED} onChange={() => {}} text="See you" />)
    expect(screen.getByTestId('b-listed')).toHaveTextContent('Listed under: Neighborhood life')
  })

  it('a pinned pick shows as picked, whatever the words say', () => {
    render(<ListedUnder idPrefix="l" value={{ picks: ['Pottery'], pinned: true }} onChange={() => {}} text="Sourdough" />)
    expect(screen.getByTestId('l-listed')).toHaveTextContent('Listed under: Crafts & makers · Pottery')
  })

  it('Change opens the 12 labels with their finer ones beneath, the current ones ticked', () => {
    render(<ListedUnder idPrefix="l" value={UNPINNED} onChange={() => {}} text="Sourdough" />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    const sheet = screen.getByTestId('l-sheet')
    expect(within(sheet).getAllByRole('group')).toHaveLength(13)
    expect(within(sheet).getByRole('checkbox', { name: 'Bakery' })).toBeChecked()
    // Food & drink comes with Bakery, so it isn't a pick of its own.
    expect(within(sheet).getByRole('checkbox', { name: 'Food & drink' })).not.toBeChecked()
  })

  it('picks up to 3, then the rest wait', () => {
    render(<ListedUnder idPrefix="l" value={{ picks: [], pinned: true }} onChange={() => {}} text="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    for (const name of ['Bakery', 'Pottery', 'Gardening']) fireEvent.click(screen.getByRole('checkbox', { name }))
    expect(screen.getByRole('checkbox', { name: 'Jewelry' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Bakery' })).toBeEnabled()
  })

  it('saving pins the pick', () => {
    const onChange = vi.fn()
    render(<ListedUnder idPrefix="l" value={UNPINNED} onChange={onChange} text="Sourdough" />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bakery' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Coffee & tea' }))
    fireEvent.click(screen.getByTestId('l-save'))
    expect(onChange).toHaveBeenCalledWith({ picks: ['Coffee & tea'], pinned: true })
  })

  it('reopening keeps every pick, however many top labels they carried', () => {
    const onChange = vi.fn()
    render(<ListedUnder idPrefix="l" value={savedValue(['Food & drink', 'Bakery', 'Coffee & tea', 'Restaurants'], true)} onChange={onChange} text="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.click(screen.getByTestId('l-save'))
    expect(onChange).toHaveBeenCalledWith({ picks: ['Bakery', 'Coffee & tea', 'Restaurants'], pinned: true })
  })

  it('Free is picked beside the 3, never instead of one', () => {
    render(<ListedUnder idPrefix="l" value={{ picks: ['Bakery', 'Pottery', 'Gardening'], pinned: true }} onChange={() => {}} text="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('checkbox', { name: 'Free' })).toBeEnabled()
  })

  it('cannot save nothing', () => {
    render(<ListedUnder idPrefix="l" value={{ picks: ['Bakery'], pinned: true }} onChange={() => {}} text="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bakery' }))
    expect(screen.getByTestId('l-save')).toBeDisabled()
  })

  it('never shows a # or a free text box', () => {
    render(<ListedUnder idPrefix="l" value={UNPINNED} onChange={() => {}} text="Sourdough" />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(document.body.textContent).not.toContain('#')
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('#1180 — what the composer sends', () => {
  it('the stored labels, and whether they were picked', () => {
    expect(labelsToSend(UNPINNED, { text: 'Sourdough' })).toEqual({ tags: ['Food & drink', 'Bakery'], labelsPinned: false })
    expect(labelsToSend({ picks: ['Pottery'], pinned: true }, { text: 'Sourdough' })).toEqual({ tags: ['Crafts & makers', 'Pottery'], labelsPinned: true })
  })
})
