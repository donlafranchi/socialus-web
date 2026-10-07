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

// #452 — the PM, 2026-10-06: fewer groups. Basics, Location, Contact, Tags & links, then Page settings.
describe('#452 — fewer groups', () => {
  const order = () => [...screen.getByTestId('edit-cards').querySelectorAll('[data-testid^="edit-card-"]')].map((c) => c.getAttribute('data-testid')!.slice('edit-card-'.length))

  it('Basics, Location, Contact, Tags & links, Values & badges, then Page settings', () => {
    renderCards()
    expect(order()).toEqual(['basics', 'where', 'contact', 'found', 'values', 'kind', 'components'])
    expect(within(card('where')).getByRole('heading')).toHaveTextContent('Location')
    expect(within(card('found')).getByRole('heading')).toHaveTextContent('Tags & links')
    expect(screen.getByRole('heading', { level: 2, name: 'Page settings' })).toBeInTheDocument()
  })

  it('no collapsible groups, and no loose Link card', () => {
    const { container } = renderCards()
    expect(container.querySelectorAll('details')).toHaveLength(0)
    expect(screen.queryByTestId('edit-link-frozen')).toBeNull()
  })

  it('has no Contact card where the phone is off', () => {
    renderCards({ contactOn: false })
    expect(screen.queryByTestId('edit-card-contact')).toBeNull()
  })

  it('Basics holds the photo, name and description in one sheet', async () => {
    renderCards()
    expect(within(card('basics')).getByTestId('edit-summary')).toHaveTextContent('Oak Park Sourdough')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Basics' }))
    const sheet = screen.getByRole('dialog', { name: 'Basics' })
    expect(within(sheet).getByTestId('edit-name')).toHaveValue('Oak Park Sourdough')
    expect(within(sheet).getByTestId('edit-description')).toBeInTheDocument()
    fireEvent.change(within(sheet).getByTestId('edit-name'), { target: { value: 'Oak Park Bread' } })
    fireEvent.click(screen.getByTestId('sheet-save'))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ groupId: 'g1', pagePath: initial.pagePath, name: 'Oak Park Bread', description: initial.description, photoUrl: initial.photoUrl }),
    )
  })

  it('Basics will not save without a name', async () => {
    renderCards()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Basics' }))
    fireEvent.change(screen.getByTestId('edit-name'), { target: { value: ' ' } })
    fireEvent.click(screen.getByTestId('sheet-save'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Give your Page a name.')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('Tags & links folds in the link, which has no edit of its own', () => {
    renderCards()
    expect(card('found')).toHaveTextContent('socialus.org/g/7k3x8m')
    expect(card('found')).toHaveTextContent('The name can change; this link can’t.')
    expect(within(card('found')).getAllByRole('button')).toHaveLength(1)
  })

  it('Tags & links edits tags and links in one sheet', async () => {
    renderCards()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Tags & links' }))
    fireEvent.click(screen.getByTestId('sheet-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tags: ['bread', 'coffee', 'pastry'], socialLinks: expect.any(Object) })))
  })
})

// #465 — the PM, 2026-10-06: planned, not built. Owner-only (this page is), nothing to tap.
describe('#465 — Values & badges, coming soon', () => {
  it('is a card marked Coming soon with one line and nothing to tap', () => {
    renderCards()
    const values = card('values')
    expect(within(values).getByRole('heading')).toHaveTextContent('Values & badges')
    expect(values).toHaveTextContent('Coming soon')
    expect(within(values).queryAllByRole('button')).toHaveLength(0)
    expect(within(values).queryAllByRole('link')).toHaveLength(0)
  })
})

// #108 — the description shows its limit as it nears it.
describe('#108 — the description limit', () => {
  it('stops at 2000 characters and counts down near the end', () => {
    renderCards()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Basics' }))
    const box = screen.getByTestId('edit-description')
    expect(box).toHaveAttribute('maxLength', '2000')
    expect(screen.queryByTestId('description-count')).toBeNull()
    fireEvent.change(box, { target: { value: 'x'.repeat(1950) } })
    expect(screen.getByTestId('description-count')).toHaveTextContent('50 characters left')
  })
})

describe('#412 — each card says what is set now', () => {
  it('Basics: the name, the first line of the description cut short, and the photo', () => {
    renderCards()
    const s = within(card('basics')).getByTestId('edit-summary').textContent!
    expect(s).toMatch(/^Oak Park Sourdough · Real bread, baked in Oak Park/)
    expect(s).not.toMatch(/Second line/)
    expect(s).toMatch(/Photo set$/)
    cleanup()
    renderCards({ photoUrl: null, name: '' }, true)
    expect(within(card('basics')).getByTestId('edit-summary')).toHaveTextContent(/^Not set yet · .* · No photo$/)
  })

  it('Tags & links: how many tags, the first of them, and which links', () => {
    renderCards()
    expect(within(card('found')).getByTestId('edit-summary')).toHaveTextContent('3 tags: bread, coffee, … · Instagram, Facebook')
    cleanup()
    renderCards({ tags: ['bread'], socialLinks: {} })
    expect(within(card('found')).getByTestId('edit-summary')).toHaveTextContent('1 tag: bread · No links')
    cleanup()
    renderCards({ tags: [], socialLinks: {} })
    expect(within(card('found')).getByTestId('edit-summary')).toHaveTextContent('Not set yet')
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

  it('what the Page is for', () => {
    renderCards()
    expect(within(card('kind')).getByTestId('edit-summary')).toHaveTextContent('Sell · Listed as Business')
  })
})

// #453 — the PM, 2026-10-06: a pencil icon button in each card header, not the word Edit.
describe('#453 — one pencil per card, in its header', () => {
  it('each editable card has exactly one pencil, named "Edit <section>", 44px, no visible word', () => {
    renderCards()
    for (const [s, title] of [['basics', 'Basics'], ['where', 'Location'], ['contact', 'Contact'], ['found', 'Tags & links'], ['kind', 'What your Page is for'], ['components', 'What your Page shows']]) {
      const buttons = within(card(s!)).getAllByRole('button')
      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveAccessibleName(`Edit ${title}`)
      expect(buttons[0]!.className).toMatch(/\bsize-tap\b/)
      expect(buttons[0]).toHaveTextContent('')
      expect(buttons[0]!.querySelector('svg')).not.toBeNull()
      expect(card(s!).querySelector('header')).toContainElement(buttons[0]!)
    }
  })

  it('a pencil opens that section only, and Save saves it and closes', async () => {
    renderCards()
    fireEvent.click(screen.getByRole('button', { name: 'Edit What your Page is for' }))
    expect(screen.getByRole('dialog', { name: 'What your Page is for' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sheet-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ groupId: 'g1', pagePath: initial.pagePath, pageKind: 'business', purpose: 'sell' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(refresh).toHaveBeenCalled()
  })

  it('the Location pencil opens the Where sheet', () => {
    renderCards()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Location' }))
    expect(screen.getByRole('dialog', { name: 'Location' })).toBeInTheDocument()
  })

  it('the Basics sheet asks for nothing sensitive', () => {
    renderCards()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Basics' }))
    expect(within(screen.getByRole('dialog')).getByText(COPY.postingSafety)).toBeInTheDocument()
  })
})

describe('#412 — the link and the way back', () => {
  it('a draft shows the link it keeps when it publishes (#411)', () => {
    renderCards({}, true)
    expect(card('found')).toHaveTextContent('socialus.org/g/7k3x8m')
    expect(card('found')).toHaveTextContent('It stays the same when you publish.')
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

  it('holds what the Page is for, what it shows, then Archive and Delete, last on the page', () => {
    render(<EditCards title="Edit P" initial={initial} onSave={onSave} isDraft={false} settings={settings} />)
    const section = screen.getByTestId('edit-settings')
    expect(section).toBe(screen.getByTestId('edit-cards').lastElementChild)
    const inside = [...section.querySelectorAll('[data-testid^="edit-card-"], [data-testid^="page-settings-"]')].map((c) => c.getAttribute('data-testid'))
    expect(inside).toEqual(['edit-card-kind', 'edit-card-components', 'page-settings-archive', 'page-settings-delete'])
  })

  it('a draft gets what it is for and what it shows, but no Archive or Delete', () => {
    render(<EditCards title="Edit P" initial={initial} onSave={onSave} isDraft settings={settings} />)
    expect(screen.getByTestId('edit-card-kind')).toBeInTheDocument()
    expect(screen.queryByTestId('page-settings')).toBeNull()
  })
})
