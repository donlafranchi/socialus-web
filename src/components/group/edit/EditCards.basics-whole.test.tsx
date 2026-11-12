// F056 criterion 1a — image, name and about edit from one prefilled page, and the public Page shows the change.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { EditCards } from './EditCards'
import type { EditorInitial } from './PageEditor'
import { ShopPublicPage } from '../ShopPublicPage'
import type { ResolvedShop } from '@/lib/groups/resolve-shop'
import { emptyWhere } from '@/components/locations/WhereFields'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/' }))
// The first picker is the Page photo: a button that picks a new image.
vi.mock('@/components/media/PagePhotoPicker', () => ({
  PagePhotoPicker: ({ label = 'Photo', onChange }: { label?: string; onChange: (u: string) => void }) => (
    <button type="button" data-testid={`pick-${label}`} onClick={() => onChange('https://example.test/new-photo.jpg')}>pick {label}</button>
  ),
}))
vi.mock('@/app/_actions/location-actions', () => ({ searchPlacesAction: vi.fn(async () => ({ ok: true, data: [] })), createLocationAction: vi.fn(), metroAnchorPlaceAction: vi.fn(), placeForPointAction: vi.fn() }))
vi.mock('@/lib/geocoding', () => ({ geocode: vi.fn(async () => []), GeocodingUnavailableError: class extends Error {} }))
afterEach(cleanup)

const initial: EditorInitial = {
  groupId: 'g1', pagePath: '/g/7k3x8m', memberId: 'm1', name: 'Oak Park Sourdough', description: 'Real bread, baked local.',
  photoUrl: 'https://example.test/old-photo.jpg', socialLinks: {}, tags: ['bread'], contact: { phone: null, hours: null }, contactOn: false,
  addressLabel: null, kind: 'business', purpose: 'sell', productsOn: true, where: emptyWhere,
}

describe('F056 criterion 1a — one prefilled page edits image, name and about', () => {
  // [guards F056.1 partial: image, name and about; the free-text values line was cut by the 2026-09-07 ruling]
  it('opens prefilled, saves a new image, name and about in one save, and the public Page shows them', async () => {
    const onSave = vi.fn(async (_i: unknown): Promise<{ ok: true }> => ({ ok: true }))
    render(<EditCards title="Edit Oak Park Sourdough" initial={initial} onSave={onSave} isDraft={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Basics' }))
    const sheet = screen.getByRole('dialog', { name: 'Basics' })
    expect(within(sheet).getByTestId('edit-name')).toHaveValue('Oak Park Sourdough')
    expect(within(sheet).getByTestId('edit-description')).toHaveValue('Real bread, baked local.')
    fireEvent.click(within(sheet).getByTestId('pick-Photo'))
    fireEvent.change(within(sheet).getByTestId('edit-name'), { target: { value: 'Oak Park Bread' } })
    fireEvent.change(within(sheet).getByTestId('edit-description'), { target: { value: 'Loaves and rolls, every morning.' } })
    fireEvent.click(screen.getByTestId('sheet-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const saved = onSave.mock.calls[0]![0] as { name: string; description: string; photoUrl: string }
    expect(saved).toMatchObject({ name: 'Oak Park Bread', description: 'Loaves and rolls, every morning.', photoUrl: 'https://example.test/new-photo.jpg' })

    cleanup()
    const shop = {
      groupId: 'g1', kind: 'business', slug: 'oak-park-bread', publicId: '7k3x8m', displayName: saved.name, publicDescription: saved.description,
      wordsHidden: false, lifecycleState: 'active', anchorLocationId: 'loc-1', purpose: 'sell', category: null, photoUrl: saved.photoUrl, socialLinks: {},
      photoHiddenAt: null, photoRemovedAt: null, discoverability: 'listed', placements: [], unclaimed: null, founder: null,
    } as unknown as ResolvedShop
    const { container } = render(<ShopPublicPage shop={shop} badge={null} items={[]} loggedIn={false} />)
    expect(screen.getByTestId('shop-name')).toHaveTextContent('Oak Park Bread')
    expect(screen.getByText('Loaves and rolls, every morning.')).toBeInTheDocument()
    expect(container.innerHTML).toContain('new-photo.jpg')
  })
})
