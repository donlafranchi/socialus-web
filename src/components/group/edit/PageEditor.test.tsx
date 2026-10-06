// #302 — Don, 2026-10-04: edit in place, by section. One Edit/Done toggle; each
// section opens a sheet with its own fields and one Save that saves and closes.
// Precedent: Google Business Profile's Edit profile sections, Apple Contacts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageEditorProvider, EditToggle, SectionEditButton, usePageEditor, type Section } from './PageEditor'
import { emptyWhere } from '@/components/locations/WhereFields'

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
const initial = {
  groupId: 'g1',
  pagePath: '/g/oak-park-sourdough-7k3x8m',
  memberId: 'm1',
  name: 'Oak Park Sourdough',
  description: 'Real bread.',
  photoUrl: null,
  socialLinks: {},
  tags: ['sourdough'],
  contact: { phone: null, hours: null },
  contactOn: true,
  addressLabel: '3117 Broadway, Sacramento',
  kind: 'business' as const,
  purpose: 'sell' as const,
  productsOn: true,
  where: emptyWhere,
}

function Page() {
  return (
    <PageEditorProvider initial={initial} onSave={onSave}>
      <EditToggle />
      <h1>Oak Park Sourdough</h1>
      <SectionEditButton section="about" />
      <SectionEditButton section="tags" />
    </PageEditorProvider>
  )
}

beforeEach(() => {
  onSave.mockClear()
  refresh.mockClear()
})
afterEach(cleanup)

describe('#302 — the owner sees the Page as visitors do, with one Edit toggle', () => {
  it('hides the section edit buttons until Edit is on', () => {
    render(<Page />)
    expect(screen.queryByRole('button', { name: /edit about/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: /edit about/i })).toBeInTheDocument()
  })

  it('Done just leaves edit mode: nothing is ever left unsaved', () => {
    render(<Page />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('button', { name: /edit about/i })).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('#302 — a section opens a sheet with only its own fields', () => {
  const openAbout = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: /edit about/i }))
  }

  it('shows that section and no other', () => {
    render(<Page />)
    openAbout()
    const sheet = screen.getByRole('dialog', { name: /about/i })
    expect(sheet).toContainElement(screen.getByRole('textbox', { name: /name/i }))
    expect(screen.queryByTestId('edit-tag-input')).toBeNull()
  })

  it('one Save saves just that section, closes, and refreshes the Page', async () => {
    render(<Page />)
    openAbout()
    fireEvent.change(screen.getByRole('textbox', { name: /description/i }), { target: { value: 'Bread, daily.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ groupId: 'g1', pagePath: initial.pagePath, name: 'Oak Park Sourdough', description: 'Bread, daily.' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(refresh).toHaveBeenCalled()
  })

  it('a failed save stays open and says why', async () => {
    onSave.mockResolvedValueOnce({ ok: false, message: 'That name is taken.' })
    render(<Page />)
    openAbout()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That name is taken.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closing with nothing changed just closes', () => {
    render(<Page />)
    openAbout()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closing with changes warns first', () => {
    render(<Page />)
    openAbout()
    fireEvent.change(screen.getByRole('textbox', { name: /description/i }), { target: { value: 'Changed.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByText(/discard your changes/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Changed.')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('tags refuse to save empty, as at publish', async () => {
    render(<Page />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: /edit tags/i }))
    fireEvent.click(screen.getByTestId('edit-tag-remove-sourdough'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one/i)
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('hours hidden for now (Don, 2026-10-05)', () => {
  it('the phone sheet has the phone, not hours, and leaves stored hours alone', async () => {
    render(
      <PageEditorProvider initial={{ ...initial, contact: { phone: '+19165550142', hours: { mon: [{ open: '09:00', close: '17:00' }] } } }} onSave={onSave}>
        <EditToggle />
        <SectionEditButton section="contact" />
      </PageEditorProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: /edit business phone/i }))
    expect(screen.getByRole('dialog', { name: 'Business phone' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /monday/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty('openingHours')
  })
})

describe('#363 — purpose first, type for listing (Don ruled A, 2026-10-05)', () => {
  const open = () => {
    render(
      <PageEditorProvider initial={initial} onSave={onSave}>
        <EditToggle />
        <SectionEditButton section="kind" />
      </PageEditorProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: /edit what your page is for/i }))
  }

  it('offers the four purposes, and the type follows the one chosen', async () => {
    open()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    fireEvent.click(screen.getByRole('radio', { name: 'Be creative' }))
    expect(screen.getByTestId('edit-page-type')).toHaveValue('group')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ groupId: 'g1', pagePath: initial.pagePath, pageKind: 'group', purpose: 'create' }))
  })

  it('the owner can list it as a different type than its purpose implies', async () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: 'Offer a service or teach' }))
    fireEvent.change(screen.getByTestId('edit-page-type'), { target: { value: 'group' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ groupId: 'g1', pagePath: initial.pagePath, pageKind: 'group', purpose: 'offer' }))
  })
})

// Don, 2026-10-05: each Add on the draft opens only its own fields, with
// pickers rather than long lists, and one primary button.
function OpenOne({ section }: { section: Section }) {
  const ctx = usePageEditor()
  return <button onClick={() => ctx!.open(section)}>add {section}</button>
}
const openOne = (section: Section) => {
  render(
    <PageEditorProvider initial={initial} onSave={onSave}>
      <OpenOne section={section} />
    </PageEditorProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: `add ${section}` }))
  return screen.getByRole('dialog')
}

describe('Don, 2026-10-05 — one section per sheet', () => {
  it('Name asks for the name only', () => {
    const d = openOne('name')
    expect(d.querySelectorAll('input, textarea, select')).toHaveLength(1)
    expect(screen.getByTestId('edit-name')).toBeInTheDocument()
  })

  it('Description asks for the description only', () => {
    const d = openOne('description')
    expect(d.querySelectorAll('input, textarea, select')).toHaveLength(1)
    expect(screen.getByTestId('edit-description')).toBeInTheDocument()
  })

  it('a sheet has one primary button, Save', () => {
    const d = openOne('description')
    expect(d.querySelectorAll('[data-variant="primary"]')).toHaveLength(1)
    expect(screen.getByTestId('sheet-save')).toHaveTextContent('Save')
  })

  it('Name saves only the name', async () => {
    openOne('name')
    fireEvent.change(screen.getByTestId('edit-name'), { target: { value: 'Oak Park Bread' } })
    fireEvent.click(screen.getByTestId('sheet-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ groupId: 'g1', pagePath: initial.pagePath, name: 'Oak Park Bread' }))
  })

  it('an empty name is refused', async () => {
    openOne('name')
    fireEvent.change(screen.getByTestId('edit-name'), { target: { value: ' ' } })
    fireEvent.click(screen.getByTestId('sheet-save'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('Where asks the one question, not an address form', () => {
    openOne('where')
    expect(screen.getByRole('group', { name: /how do people find you/i })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('Where with no answer says so rather than saving', async () => {
    openOne('where')
    fireEvent.click(screen.getByTestId('sheet-save'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/how people find you/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('Links shows a picker, not every platform at once', () => {
    openOne('links')
    expect(screen.queryByTestId('social-instagram')).toBeNull()
    fireEvent.change(screen.getByTestId('social-add'), { target: { value: 'instagram' } })
    expect(screen.getByTestId('social-instagram')).toBeInTheDocument()
    expect(screen.queryByTestId('social-facebook')).toBeNull()
  })
})
