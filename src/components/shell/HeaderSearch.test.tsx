import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { HeaderSearch } from './HeaderSearch'
import { ExploreSearchProvider, useLendExploreSearch, type ExploreSearch } from './explore-search'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

afterEach(() => {
  cleanup()
  push.mockReset()
})

const scope = vi.fn()
const filters = vi.fn()
const TAGS = ['music']

function Lender({ initial = '' }: { initial?: string }) {
  const [query, setQuery] = useState(initial)
  const search: ExploreSearch = { query, onQueryChange: setQuery, knownTags: TAGS, areaLabel: 'Midtown', onOpenScope: scope, filtersActive: false, onOpenFilters: filters, focusRequest: 0 }
  useLendExploreSearch(search)
  return <output data-testid="box">{query}</output>
}

const onExplore = (initial = '') =>
  render(
    <ExploreSearchProvider>
      <HeaderSearch />
      <Lender initial={initial} />
    </ExploreSearchProvider>,
  )
const open = () => fireEvent.click(screen.getByTestId('search-pill'))

describe('HeaderSearch (Airbnb-style, Don 2026-11-01)', () => {
  it('idle, the pill reads what, where and when', () => {
    onExplore('bakery today')
    const pill = screen.getByTestId('search-pill')
    expect(pill).toHaveTextContent('bakery')
    expect(pill).toHaveTextContent('Midtown')
    expect(pill).toHaveTextContent('Today')
  })

  it('off Explore it reads Anything · Anywhere nearby · Any time', () => {
    render(<HeaderSearch />)
    expect(screen.getByTestId('search-pill')).toHaveTextContent(/Anything.*Anywhere nearby.*Any time/)
  })

  it('opens a Search dialog with What, Where and When', () => {
    onExplore()
    open()
    const panel = screen.getByRole('dialog', { name: 'Search' })
    expect(within(panel).getByTestId('search-input')).toBeInTheDocument()
    expect(within(panel).getByTestId('search-where')).toHaveTextContent('Midtown')
    expect(within(panel).getByRole('radio', { name: 'This weekend' })).toBeInTheDocument()
  })

  it('What types straight into the same box', () => {
    onExplore()
    open()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'sourdough' } })
    expect(screen.getByTestId('box')).toHaveTextContent('sourdough')
  })

  it('a kind and a When write their words into the box', () => {
    onExplore('bakery')
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Events' }))
    fireEvent.click(screen.getByRole('radio', { name: 'This weekend' }))
    expect(screen.getByTestId('box')).toHaveTextContent('bakery events this weekend')
    expect(screen.getByRole('checkbox', { name: 'Events' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Any time' }))
    expect(screen.getByTestId('box').textContent).toBe('bakery events')
  })

  it('Where opens the area sheet and Filters the filter sheet, closing the panel', () => {
    onExplore()
    open()
    fireEvent.click(screen.getByTestId('search-where'))
    expect(scope).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument()
    open()
    fireEvent.click(screen.getByTestId('search-filters'))
    expect(filters).toHaveBeenCalled()
  })

  it('Escape and the Search button fold it back to the pill', () => {
    onExplore()
    open()
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Search' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    open()
    fireEvent.click(screen.getByTestId('search-submit'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('off Explore, Search sends the words to Explore', () => {
    render(<HeaderSearch />)
    open()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'tacos' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Today' }))
    fireEvent.click(screen.getByTestId('search-submit'))
    expect(push).toHaveBeenCalledWith('/explore?q=tacos%20today')
    expect(screen.queryByTestId('search-where')).not.toBeInTheDocument()
  })

  it('its controls are 44px', () => {
    onExplore()
    expect(screen.getByTestId('search-pill').className).toMatch(/min-h-11|h-11/)
    open()
    expect(screen.getByTestId('search-where').className).toMatch(/min-h-11|min-h-tap/)
  })
})
