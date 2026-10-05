// #302 — Don, 2026-10-04: edit in place, by section. One Edit/Done toggle; each
// section opens a sheet with its own fields and one Save that saves and closes.
// Precedent: Google Business Profile's Edit profile sections, Apple Contacts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageEditorProvider, EditToggle, SectionEditButton } from './PageEditor'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/components/media/PagePhotoPicker', () => ({ PagePhotoPicker: () => null }))
vi.mock('@/app/_actions/location-actions', () => ({
  searchPlacesAction: vi.fn(async () => ({ ok: true, data: [] })),
  createLocationAction: vi.fn(),
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
  badges: {},
  useCase: 'selling' as const,
  productsOn: true,
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

  it('Cancel with nothing changed just closes', () => {
    render(<Page />)
    openAbout()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Cancel with changes warns first', () => {
    render(<Page />)
    openAbout()
    fireEvent.change(screen.getByRole('textbox', { name: /description/i }), { target: { value: 'Changed.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText(/discard your changes/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Changed.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
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

describe('#363 — type and use case, changeable in settings (ruled 2026-10-05)', () => {
  it('offers the four use cases under the two types and saves the one chosen', async () => {
    render(
      <PageEditorProvider initial={initial} onSave={onSave}>
        <EditToggle />
        <SectionEditButton section="kind" />
      </PageEditorProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: /edit type of page/i }))
    expect(screen.getByRole('group', { name: 'Business' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Social group' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    fireEvent.click(screen.getByRole('radio', { name: /testing interest/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ groupId: 'g1', pagePath: initial.pagePath, pageKind: 'group', useCase: 'testing_interest' }))
  })
})

describe('#371 — the Badges sheet', () => {
  const open = () => {
    render(
      <PageEditorProvider initial={{ ...initial, badges: { since: 1998 } }} onSave={onSave}>
        <EditToggle />
        <SectionEditButton section="badges" />
      </PageEditorProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: /edit badges/i }))
  }

  it('offers the facts that fit the type first, with what each will say', () => {
    open()
    const sheet = screen.getByRole('dialog', { name: 'Badges' })
    expect(sheet).toHaveTextContent('Says family-owned')
    expect(screen.queryByRole('switch', { name: /locally owned/i })).toBeNull()
    expect(sheet).toHaveTextContent(/locally owned comes from your business registration/i)
  })

  it('saves the facts turned on, and the year', async () => {
    open()
    fireEvent.click(screen.getByRole('switch', { name: 'Family-owned' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ groupId: 'g1', pagePath: initial.pagePath, badges: { family_owned: true, since: 1998 } }),
    )
  })
})
