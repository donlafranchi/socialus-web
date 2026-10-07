// The scope control. The load-bearing assertion is the second one: a metro the
// platform does not serve must not be choosable, because choosing it could only
// relabel the page while the results underneath stayed identical.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AreaPicker } from './AreaPicker'

const METROS = [
  { id: '1', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true },
  { id: '2', slug: 'boise-city-id', name: 'Boise City, ID', isOpen: false },
  { id: '3', slug: 'bend-or', name: 'Bend, OR', isOpen: false },
]

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }),
}))
const onChoose = vi.fn()
const onClose = vi.fn()

function renderSheet(currentSlug: string | null = null) {
  return render(
    <AreaPicker
      open
      currentSlug={currentSlug}
      metros={METROS}
      onClose={onClose}
      onChoose={onChoose}
    />,
  )
}

afterEach(() => {
  onChoose.mockClear()
  onClose.mockClear()
  cleanup()
})

describe('AreaPicker', () => {
  it('separates where SocialUs runs from where it does not', async () => {
    renderSheet()
    await screen.findByTestId('scope-open-list')
    expect(screen.getByText('Where SocialUs is running')).toBeInTheDocument()
    expect(screen.getByText('Not covered yet')).toBeInTheDocument()
  })

  it('makes an open metro choosable', async () => {
    renderSheet()
    fireEvent.click(await screen.findByTestId('scope-metro-sacramento-roseville-ca'))
    expect(onChoose).toHaveBeenCalledWith(METROS[0])
  })

  // This assertion changed shape, and the change is the point. The row used to
  // be dead text — correct about scope, useless to someone who found their own
  // city. It is now tappable and still never becomes the scope: the invariant
  // was never "not a button", it was "you cannot browse here".
  it('never makes an unserved metro the scope, even though the row is tappable', async () => {
    renderSheet()
    const row = await screen.findByTestId('scope-metro-boise-city-id')
    expect(row).toHaveAttribute('data-selectable', 'false')
    fireEvent.click(row)
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('opens the not-covered panel instead, naming the metro', async () => {
    renderSheet()
    fireEvent.click(await screen.findByTestId('scope-metro-boise-city-id'))
    const panel = await screen.findByTestId('metro-not-covered')
    expect(panel).toHaveTextContent('Boise City, ID')
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('the examples in that panel are marked, and none of them is a link', async () => {
    renderSheet()
    fireEvent.click(await screen.findByTestId('scope-metro-boise-city-id'))
    const block = await screen.findByTestId('example-block')
    const cards = within(block).getAllByTestId('example-card')
    expect(cards.length).toBeGreaterThan(0)
    for (const c of cards) {
      expect(within(c).getByTestId('example-mark')).toHaveTextContent(/example/i)
      // No affordance that implies a real Page.
      expect(c.querySelector('a')).toBeNull()
      expect(c.querySelector('button')).toBeNull()
    }
  })

  it('the example block says the cards are made up, not that they are stock', async () => {
    renderSheet()
    fireEvent.click(await screen.findByTestId('scope-metro-boise-city-id'))
    const block = await screen.findByTestId('example-block')
    expect(block).toHaveTextContent(/made up/i)
    expect(block).toHaveTextContent(/Nothing here is a real listing in Boise City, ID/i)
  })

  it('marks the metro currently being shown', async () => {
    renderSheet('sacramento-roseville-ca')
    const row = await screen.findByTestId('scope-metro-sacramento-roseville-ca')
    expect(row).toHaveAttribute('data-current', 'true')
    expect(row).toHaveTextContent('Showing')
  })

  it('searches across both groups', async () => {
    renderSheet()
    fireEvent.change(await screen.findByTestId('scope-search'), { target: { value: 'bend' } })
    await waitFor(() => expect(screen.queryByTestId('scope-metro-boise-city-id')).toBeNull())
    expect(screen.getByTestId('scope-metro-bend-or')).toBeInTheDocument()
    expect(screen.queryByTestId('scope-metro-sacramento-roseville-ca')).toBeNull()
  })

  it('renders nothing when closed', () => {
    render(
      <AreaPicker
        open={false}
        currentSlug={null}
        metros={METROS}
        onClose={onClose}
        onChoose={onChoose}
      />,
    )
    expect(screen.queryByTestId('scope-sheet')).toBeNull()
  })
})

// #476 — pick a neighbourhood from a type-to-search list, in the current metro.
describe('#476 — neighbourhoods', () => {
  const onChooseArea = vi.fn()
  const onClearArea = vi.fn()
  const search = vi.fn(async (q: string) => (q.startsWith('mid') ? [{ id: 'p-1', name: 'Midtown' }] : []))

  function renderWithAreas(currentAreaId: string | null = null, onSearchAreas: typeof search | undefined = search) {
    return render(
      <AreaPicker
        open
        currentSlug="sacramento-roseville-ca"
        metros={METROS}
        onClose={onClose}
        onChoose={onChoose}
        onSearchAreas={onSearchAreas}
        currentAreaId={currentAreaId}
        onChooseArea={onChooseArea}
        onClearArea={onClearArea}
      />,
    )
  }

  afterEach(() => {
    onChooseArea.mockClear()
    onClearArea.mockClear()
    search.mockClear()
  })

  it('searches the neighbourhoods as you type and picks one', async () => {
    renderWithAreas()
    fireEvent.change(screen.getByTestId('scope-search'), { target: { value: 'mid' } })
    const row = await screen.findByTestId('scope-area-p-1')
    expect(search).toHaveBeenCalledWith('mid')
    fireEvent.click(row)
    expect(onChooseArea).toHaveBeenCalledWith({ id: 'p-1', name: 'Midtown' })
  })

  it('shows no neighbourhood group before anything is typed', () => {
    renderWithAreas()
    expect(screen.queryByTestId('scope-areas')).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('offers the whole metro back once a neighbourhood is picked', () => {
    renderWithAreas('p-1')
    fireEvent.click(screen.getByTestId('scope-area-clear'))
    expect(onClearArea).toHaveBeenCalled()
  })

  it('has no neighbourhood group when the metro has none to offer', () => {
    renderWithAreas(null, undefined)
    fireEvent.change(screen.getByTestId('scope-search'), { target: { value: 'mid' } })
    expect(screen.queryByTestId('scope-areas')).toBeNull()
  })
})
