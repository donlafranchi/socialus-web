// #412 — the PM, 2026-10-06: the owner's Edit Page is tidy section cards. Each
// card shows what's set now and has one Edit, which opens that section's sheet.
// Precedent: Google Business Profile's Edit profile, Shopify settings, Airbnb's
// listing editor.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { EditCards } from './EditCards'
import type { EditorInitial } from './PageEditor'
import { emptyWhere } from '@/components/locations/WhereFields'
import { COPY } from '@/lib/copy'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/components/media/PagePhotoPicker', () => ({ PagePhotoPicker: () => null }))
vi.mock('@/app/_actions/location-actions', () => ({
  searchPlacesAction: vi.fn(async () => ({ ok: true, data: [] })),
  createLocationAction: vi.fn(),
  metroAnchorPlaceAction: vi.fn(),
  placeForPointAction: vi.fn(),
}))
vi.mock('@/lib/geocoding', () => ({ geocode: vi.fn(async () => []), GeocodingUnavailableError: class extends Error {} }))

const onSave = vi.fn(async (_i: unknown): Promise<{ ok: true } | { ok: false; message: string }> => ({ ok: true }))
const initial: EditorInitial = {
  groupId: 'g1',
  pagePath: '/g/7k3x8m',
  memberId: 'm1',
  name: 'Oak Park Sourdough',
  description: 'Real bread, baked in Oak Park every morning before the sun is up, by people who love it.\nSecond line.',
  photoUrl: 'https://example.test/p.jpg',
  socialLinks: { instagram: 'https://instagram.com/oakpark', facebook: 'https://facebook.com/oakpark' },
  tags: ['bread', 'coffee', 'pastry'],
  contact: { phone: '+19165550142', hours: null },
  contactOn: true,
  addressLabel: '3117 Broadway, Sacramento',
  kind: 'business',
  purpose: 'sell',
  productsOn: true,
  where: emptyWhere,
}

const renderCards = (over: Partial<EditorInitial> = {}, isDraft = false) =>
  render(<EditCards title="Edit Oak Park Sourdough" initial={{ ...initial, ...over }} onSave={onSave} isDraft={isDraft} />)

const card = (s: string) => screen.getByTestId(`edit-card-${s}`)

beforeEach(() => {
  onSave.mockClear()
  refresh.mockClear()
})
afterEach(cleanup)

describe('#412 — cards grouped under collapsible headings', () => {
  it('groups the cards, in order, and opens only the first group', () => {
    const { container } = renderCards()
    const groups = [...container.querySelectorAll('details')]
    expect(groups.map((g) => g.querySelector('summary')!.textContent)).toEqual(['About your Page', 'Location', 'Contact', 'Tags and links'])
    expect(groups.map((g) => g.open)).toEqual([true, false, false, false])
  })

  it('puts each card in its group', () => {
    renderCards()
    const inGroup = (g: string) => [...screen.getByTestId(`edit-group-${g}`).querySelectorAll('[data-testid^="edit-card-"]')].map((c) => c.getAttribute('data-testid'))
    expect(inGroup('about')).toEqual(['edit-card-name', 'edit-card-description', 'edit-card-photo', 'edit-card-kind', 'edit-card-components'])
    expect(inGroup('location')).toEqual(['edit-card-where'])
    expect(inGroup('contact')).toEqual(['edit-card-contact'])
    expect(inGroup('found')).toEqual(['edit-card-tags', 'edit-card-links'])
  })

  it('each heading is a keyboard-reachable toggle', () => {
    const { container } = renderCards()
    for (const s of container.querySelectorAll('summary')) expect(s.className).toMatch(/\bmin-h-tap\b/)
  })

  it('has no Contact group where hours and phone are off', () => {
    renderCards({ contactOn: false })
    expect(screen.queryByTestId('edit-group-contact')).toBeNull()
    expect(screen.queryByTestId('edit-card-contact')).toBeNull()
  })
})

describe('#412 — each card says what is set now', () => {
  it('the name', () => {
    renderCards()
    expect(within(card('name')).getByTestId('edit-summary')).toHaveTextContent('Oak Park Sourdough')
  })

  it('the first line of the description, cut short', () => {
    renderCards()
    const s = within(card('description')).getByTestId('edit-summary').textContent!
    expect(s.startsWith('Real bread, baked in Oak Park')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    expect(s).not.toMatch(/Second line/)
  })

  it('how many tags, and the first of them', () => {
    renderCards()
    expect(within(card('tags')).getByTestId('edit-summary')).toHaveTextContent('3 tags: bread, coffee, …')
    cleanup()
    renderCards({ tags: ['bread'] })
    expect(within(card('tags')).getByTestId('edit-summary')).toHaveTextContent('1 tag: bread')
  })

  it('where it is, or that it is not set yet', () => {
    renderCards()
    expect(within(card('where')).getByTestId('edit-summary')).toHaveTextContent('3117 Broadway, Sacramento')
    cleanup()
    renderCards({ addressLabel: null })
    expect(within(card('where')).getByTestId('edit-summary')).toHaveTextContent('Not set yet')
  })

  it('the phone', () => {
    renderCards()
    expect(within(card('contact')).getByTestId('edit-summary')).toHaveTextContent('Phone (916) 555-0142')
    cleanup()
    renderCards({ contact: { phone: null, hours: null } })
    expect(within(card('contact')).getByTestId('edit-summary')).toHaveTextContent('Not set yet')
  })

  it('which links', () => {
    renderCards()
    expect(within(card('links')).getByTestId('edit-summary')).toHaveTextContent('Instagram, Facebook')
    cleanup()
    renderCards({ socialLinks: {} })
    expect(within(card('links')).getByTestId('edit-summary')).toHaveTextContent('Not set yet')
  })

  it('whether there is a photo', () => {
    renderCards()
    expect(within(card('photo')).getByTestId('edit-summary')).toHaveTextContent('Photo set')
    cleanup()
    renderCards({ photoUrl: null })
    expect(within(card('photo')).getByTestId('edit-summary')).toHaveTextContent('No photo')
  })

  it('what the Page is for', () => {
    renderCards()
    expect(within(card('kind')).getByTestId('edit-summary')).toHaveTextContent('Sell · Listed as Business')
  })

  it('an unnamed draft has no name yet', () => {
    renderCards({ name: '' }, true)
    expect(within(card('name')).getByTestId('edit-summary')).toHaveTextContent('Not set yet')
  })
})

describe('#412 — one Edit per card, in its header', () => {
  it('each card has exactly one Edit, named for its section, 44px tall', () => {
    renderCards()
    for (const [s, title] of [['name', 'name'], ['description', 'description'], ['photo', 'photo'], ['where', 'where'], ['tags', 'tags'], ['links', 'links'], ['kind', 'what your Page is for'], ['components', 'what your Page shows']]) {
      const buttons = within(card(s!)).getAllByRole('button')
      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveAccessibleName(`Edit ${title}`)
      expect(buttons[0]!.className).toMatch(/\bmin-h-tap\b/)
      expect(card(s!).querySelector('header')).toContainElement(buttons[0]!)
    }
  })

  it('Edit opens that section only, and Save saves it and closes', async () => {
    renderCards()
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }))
    const sheet = screen.getByRole('dialog', { name: 'Description' })
    expect(within(sheet).queryByTestId('edit-name')).toBeNull()
    fireEvent.change(screen.getByTestId('edit-description'), { target: { value: 'Bread, daily.' } })
    fireEvent.click(screen.getByTestId('sheet-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ groupId: 'g1', pagePath: initial.pagePath, description: 'Bread, daily.' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(refresh).toHaveBeenCalled()
  })

  it('a card in a closed group opens its sheet too', () => {
    renderCards()
    fireEvent.click(screen.getByRole('button', { name: 'Edit where' }))
    expect(screen.getByRole('dialog', { name: 'Where' })).toBeInTheDocument()
  })

  it('the words and photo sheets ask for nothing sensitive', () => {
    renderCards()
    fireEvent.click(screen.getByRole('button', { name: 'Edit photo' }))
    expect(within(screen.getByRole('dialog')).getByText(COPY.postingSafety)).toBeInTheDocument()
  })
})

describe('#412 — the link and the way back', () => {
  it('a live Page keeps its frozen-link note, word for word, with no Edit', () => {
    renderCards()
    const link = screen.getByTestId('edit-link-frozen')
    expect(link).toHaveTextContent('socialus.org/g/7k3x8m')
    expect(link).toHaveTextContent('The name can change; this link can’t. People have it already, and moving it would break it.')
    expect(within(link).queryByRole('button')).toBeNull()
  })

  it('a draft shows the link it keeps when it publishes (#411)', () => {
    renderCards({}, true)
    const link = screen.getByTestId('edit-link-frozen')
    expect(link).toHaveTextContent('socialus.org/g/7k3x8m')
    expect(link).toHaveTextContent('It stays the same when you publish.')
  })

  // Tidy and contained (the PM, 2026-10-06): the way out sits in the page's
  // header, not loose under the last card (Apple HIG's Done in the nav bar).
  it('Done goes back to the Page, from the page header', () => {
    renderCards()
    const header = screen.getByTestId('edit-header')
    expect(within(header).getByRole('heading', { level: 1, name: 'Edit Oak Park Sourdough' })).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: 'Done' })).toHaveAttribute('href', initial.pagePath)
    expect(screen.getAllByRole('link', { name: 'Done' })).toHaveLength(1)
  })
})

describe('#423 — Page settings, last', () => {
  const ok = vi.fn(async () => ({ ok: true as const }))
  const settings = { lifecycleState: 'active' as const, onArchive: ok, onRestore: ok, onDelete: ok }

  it('sits after every other group and the link, last on the page', () => {
    const { container } = render(<EditCards title="Edit P" initial={initial} onSave={onSave} isDraft={false} settings={settings} />)
    const groups = [...container.querySelectorAll('details')]
    expect(groups.at(-1)!.querySelector('summary')!.textContent).toBe('Page settings')
    const link = screen.getByTestId('edit-link-frozen')
    expect(link.compareDocumentPosition(groups.at(-1)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is not offered on a draft', () => {
    render(<EditCards title="Edit P" initial={initial} onSave={onSave} isDraft settings={settings} />)
    expect(screen.queryByTestId('page-settings')).toBeNull()
  })
})
