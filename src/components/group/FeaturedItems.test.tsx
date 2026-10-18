import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/components/media/PagePhotoPicker', () => ({ PagePhotoPicker: () => <div data-testid="photo-picker" /> }))

import { FeaturedItems } from './FeaturedItems'
import { FEATURED_ITEMS_MAX, type FeaturedItem } from '@/lib/items/featured'

// #909 — a Page's featured products and services.

const GROUP = '11111111-1111-1111-1111-111111111111'
const item = (o: Partial<FeaturedItem> = {}): FeaturedItem => ({
  id: 'i1',
  kind: 'product',
  name: 'Milkweed seed',
  details: '',
  priceCents: 450,
  inStock: true,
  photoUrl: null,
  sampleSourceUrl: null,
  hidden: false,
  ...o,
})

afterEach(cleanup)

const ok = async (_input?: unknown) => ({ ok: true as const, data: { itemId: 'new' } })

function renderIt(o: Partial<Parameters<typeof FeaturedItems>[0]> = {}) {
  return render(
    <FeaturedItems groupId={GROUP} items={[item()]} canEdit={false} memberId={null} onSave={ok} onRemove={ok} {...o} />,
  )
}

describe('FeaturedItems — what a visitor sees', () => {
  it('shows each with its name and price', () => {
    renderIt()
    expect(screen.getByText('Milkweed seed')).toBeInTheDocument()
    expect(screen.getByText('$4.50')).toBeInTheDocument()
  })

  it('renders nothing for a visitor when there are none', () => {
    const { container } = renderIt({ items: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('marks one that is out of stock, and a service that is not available', () => {
    renderIt({ items: [item({ inStock: false }), item({ id: 'i2', kind: 'service', name: 'Tune-up', inStock: false })] })
    expect(screen.getByText('Out of stock')).toBeInTheDocument()
    expect(screen.getByText('Not available now')).toBeInTheDocument()
  })

  it('labels a sample and credits the site it came from', () => {
    renderIt({ items: [item({ sampleSourceUrl: 'https://www.fieldandfarm.com/shop/seed' })] })
    expect(screen.getByText('Sample')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /fieldandfarm\.com/ })).toHaveAttribute('href', 'https://www.fieldandfarm.com/shop/seed')
  })

  it('offers no edit controls', () => {
    renderIt()
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()
  })
})

describe('FeaturedItems — the owner', () => {
  it('an empty section asks for the first one', () => {
    renderIt({ items: [], canEdit: true, memberId: 'm' })
    expect(screen.getByTestId('featured-empty-owner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add your first/i })).toBeInTheDocument()
  })

  it('adds one in three taps: Add, a name, Save', async () => {
    const onSave = vi.fn(ok)
    renderIt({ items: [], canEdit: true, memberId: 'm', onSave })
    fireEvent.click(screen.getByRole('button', { name: /add your first/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bee balm starts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0]![0]).toMatchObject({ groupId: GROUP, kind: 'product', name: 'Bee balm starts', priceCents: null, inStock: true })
    expect(await screen.findByText('Bee balm starts')).toBeInTheDocument()
  })

  it('refuses a price it cannot read, without saving', () => {
    const onSave = vi.fn(ok)
    renderIt({ items: [], canEdit: true, memberId: 'm', onSave })
    fireEvent.click(screen.getByRole('button', { name: /add your first/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Seed' } })
    fireEvent.change(screen.getByLabelText('Price (optional)'), { target: { value: 'cheap' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('edits one: tap it, switch it out of stock, save', async () => {
    const onSave = vi.fn(async (_input?: unknown) => ({ ok: true as const, data: { itemId: 'i1' } }))
    renderIt({ canEdit: true, memberId: 'm', onSave })
    fireEvent.click(screen.getByRole('button', { name: /edit milkweed seed/i }))
    fireEvent.click(screen.getByRole('switch', { name: 'In stock' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0]![0]).toMatchObject({ itemId: 'i1', inStock: false, priceCents: 450 })
  })

  it('removes one', async () => {
    const onRemove = vi.fn(async (_input?: unknown) => ({ ok: true as const, data: { itemId: 'i1' } }))
    renderIt({ canEdit: true, memberId: 'm', onRemove })
    fireEvent.click(screen.getByRole('button', { name: /edit milkweed seed/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith({ groupId: GROUP, itemId: 'i1' }))
    await waitFor(() => expect(screen.queryByText('Milkweed seed')).toBeNull())
  })

  it(`stops offering Add at ${FEATURED_ITEMS_MAX}`, () => {
    const many = Array.from({ length: FEATURED_ITEMS_MAX }, (_, n) => item({ id: `i${n}`, name: `Thing ${n}` }))
    renderIt({ items: many, canEdit: true, memberId: 'm' })
    expect(screen.queryByRole('button', { name: /^add/i })).toBeNull()
    expect(screen.getByText(new RegExp(`${FEATURED_ITEMS_MAX} of ${FEATURED_ITEMS_MAX}`))).toBeInTheDocument()
  })

  it('shows the error the server sends back', async () => {
    const onSave = vi.fn(async () => ({ ok: false as const, message: 'A Page shows up to 12.' }))
    renderIt({ items: [], canEdit: true, memberId: 'm', onSave })
    fireEvent.click(screen.getByRole('button', { name: /add your first/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Seed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const sheet = await screen.findByTestId('featured-item-sheet')
    expect(await within(sheet).findByText('A Page shows up to 12.')).toBeInTheDocument()
  })
})

describe('FeaturedItems — reports (#909)', () => {
  const report = { loggedIn: true, returnTo: '/g/x', onSend: vi.fn(async () => ({ ok: true as const })) }

  it('a visitor can report each one', () => {
    renderIt({ report })
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument()
  })

  it('the owner gets no report control on their own', () => {
    renderIt({ report, canEdit: true, memberId: 'm' })
    expect(screen.queryByRole('button', { name: /more/i })).toBeNull()
  })

  it('the owner is told when a report hid one, and how to show it again', () => {
    renderIt({ items: [item({ hidden: true })], canEdit: true, memberId: 'm' })
    expect(screen.getByTestId('featured-item-hidden')).toHaveTextContent(/hidden after a report/i)
  })
})
