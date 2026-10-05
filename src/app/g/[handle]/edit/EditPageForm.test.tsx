// The edit form.
//
// Issue #180 — the ADDRESS is editable now. What is frozen is the Page's
// LINK, which is a different thing wearing the same word: the old form put
// the URL under a heading that said "Address" and called it unchangeable, so
// an owner reading it was told they could not move house.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { EditPageForm } from './EditPageForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

// The address picker reaches for a geocoder and for our own places on every
// keystroke. Stubbed: this file is about what the form does with a chosen
// address, not about the combobox, which has its own suite.
vi.mock('@/lib/geocoding', () => ({
  geocode: vi.fn(async () => []),
  GeocodingUnavailableError: class extends Error {},
}))
const { searchPlacesAction } = vi.hoisted(() => ({ searchPlacesAction: vi.fn() }))
vi.mock('@/app/_actions/location-actions', () => ({ searchPlacesAction }))

const onSave = vi.fn(
  async (_input: unknown): Promise<{ ok: true } | { ok: false; message: string }> => ({ ok: true }),
)
const onCreateLocation = vi.fn(async () => ({ ok: true, data: { id: 'loc-new', label: 'x' } }) as const)

/** Drive the embedded picker the way a person does: type, wait for the list,
 *  click a place. The combobox has its own suite; this is the handover. */
async function pickOakPark() {
  fireEvent.click(screen.getByTestId('edit-address-change'))
  fireEvent.change(screen.getByTestId('edit-address-address-input'), {
    target: { value: 'Oak Park' },
  })
  await waitFor(() => screen.getByTestId('edit-address-address-suggestion-0'))
  fireEvent.click(screen.getByTestId('edit-address-address-suggestion-0'))
}

function renderForm(over: Partial<Parameters<typeof EditPageForm>[0]> = {}) {
  onSave.mockClear()
  onCreateLocation.mockClear()
  return render(
    <EditPageForm
      groupId="g1"
      memberId="m1"
      pagePath="/g/oak-park-sourdough-7k3x8m"
      slug="oak-park-sourdough"
      initialName="Oak Park Sourdough"
      initialDescription="Real bread."
      initialPhotoUrl={null}
      initialSocialLinks={{}}
      initialAddressLabel="3117 Broadway, Sacramento, CA"
      initialTags={['sourdough', 'rye']}
      onSave={onSave}
      onCreateLocation={onCreateLocation}
      {...over}
    />,
  )
}

afterEach(cleanup)

beforeEach(() => {
  searchPlacesAction.mockReset()
  searchPlacesAction.mockResolvedValue({
    ok: true,
    data: [{ id: 'pl-oak-park', name: 'Oak Park', kind: 'neighborhood', parentName: 'Sacramento' }],
  })
})

describe('editing what was set at creation', () => {
  it('starts from what is already there', () => {
    renderForm()
    expect(screen.getByTestId('edit-name')).toHaveValue('Oak Park Sourdough')
    expect(screen.getByTestId('edit-description')).toHaveValue('Real bread.')
  })

  it('saves the changed fields', async () => {
    renderForm()
    fireEvent.change(screen.getByTestId('edit-name'), { target: { value: 'Oak Park Bakehouse' } })
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Oak Park Bakehouse' })),
    )
  })
})

describe('the link is frozen, and says so', () => {
  // A field that quietly is not there reads as a missing feature. Don came to
  // say there was no way to edit a Page; silence is what that sounds like.
  it('shows the link, uneditable, with the reason', () => {
    renderForm()
    const block = screen.getByTestId('edit-link-frozen')
    expect(block).toHaveTextContent('/g/oak-park-sourdough-7k3x8m')
    expect(block).toHaveTextContent(/would break it/i)
    expect(block.querySelector('input')).toBeNull()
  })

  it('calls it a link, not an address — the address is the place it is in', () => {
    renderForm()
    expect(screen.getByTestId('edit-link-frozen')).not.toHaveTextContent(/^Address/)
  })
})

describe('the address, which the owner can change', () => {
  it('shows where the Page is now', () => {
    renderForm()
    expect(screen.getByTestId('edit-address')).toHaveTextContent('3117 Broadway, Sacramento, CA')
  })

  it('says so plainly when no address was ever chosen', () => {
    renderForm({ initialAddressLabel: null })
    expect(screen.getByTestId('edit-address')).toHaveTextContent(/not set/i)
  })

  it('opens the same picker creation uses, so the two cannot drift', () => {
    renderForm()
    fireEvent.click(screen.getByTestId('edit-address-change'))
    expect(screen.getByTestId('edit-address-address-input')).toBeInTheDocument()
  })

  it('leaves the address alone when the owner never opened the picker', async () => {
    renderForm()
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onCreateLocation).not.toHaveBeenCalled()
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('anchorLocationId')
  })

  it('leaves it alone when the picker was opened but nothing was chosen', async () => {
    renderForm()
    fireEvent.click(screen.getByTestId('edit-address-change'))
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onCreateLocation).not.toHaveBeenCalled()
  })

  it('makes the Location and points the Page at it when one was chosen', async () => {
    renderForm()
    await pickOakPark()
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(onCreateLocation).toHaveBeenCalled())
    expect(onCreateLocation).toHaveBeenCalledWith(
      expect.objectContaining({ neighborhoodId: 'pl-oak-park', label: 'Oak Park' }),
    )
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ anchorLocationId: 'loc-new' }),
      ),
    )
  })

  it('does not move the Page when the Location could not be made', async () => {
    // Half a move is worse than none: a Page pointing at nothing has no
    // address at all, which is the state #175 was reported from.
    onCreateLocation.mockResolvedValueOnce({
      ok: false,
      message: 'A Location needs a real address or a neighbourhood — we never guess one.',
      code: 'location_needs_place',
    } as never)
    renderForm()
    await pickOakPark()
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() =>
      expect(screen.getByTestId('edit-error')).toHaveTextContent(/never guess one/i),
    )
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('a failed save says why', () => {
  it('shows the handler message rather than a generic failure', async () => {
    onSave.mockResolvedValueOnce({ ok: false, message: 'these links could not be read: instagram' })
    renderForm()
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() =>
      expect(screen.getByTestId('edit-error')).toHaveTextContent(/instagram/),
    )
    expect(screen.queryByText(/something went wrong/i)).toBeNull()
  })

  it('confirms when it worked', async () => {
    renderForm()
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(screen.getByTestId('edit-saved')).toBeInTheDocument())
  })
})

describe('handles, not URLs — the bug Don hit', () => {
  it('shows the prefix so the member types only their username', () => {
    renderForm()
    expect(screen.getByTestId('social-prefix-instagram')).toHaveTextContent('instagram.com/')
  })

  it('accepts a bare handle and saves the composed URL', async () => {
    renderForm()
    fireEvent.change(screen.getByTestId('social-instagram'), {
      target: { value: 'donlafranchi' },
    })
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          socialLinks: { instagram: 'https://instagram.com/donlafranchi' },
        }),
      ),
    )
  })

  it('shows a stored URL back as the handle the member typed', () => {
    renderForm({ initialSocialLinks: { instagram: 'https://instagram.com/clara' } })
    expect(screen.getByTestId('social-instagram')).toHaveValue('clara')
  })

  it('names the field that is wrong rather than failing the whole save opaquely', async () => {
    renderForm()
    fireEvent.change(screen.getByTestId('social-instagram'), { target: { value: 'has space' } })
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(screen.getByTestId('edit-error')).toHaveTextContent(/instagram/))
    expect(onSave).not.toHaveBeenCalled()
  })
})

// #276 — "Done" was a plain link beside Save, so an unsaved change was lost
// without a word. While anything is unsaved, Done asks first.
describe('EditPageForm — unsaved changes', () => {
  it('with nothing changed, Done goes straight back to the Page', () => {
    renderForm()
    const done = screen.getByRole('link', { name: 'Done' })
    expect(done).toHaveAttribute('href', '/g/oak-park-sourdough-7k3x8m')
  })

  it('with a change, Done asks instead of leaving', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/name/i, { selector: 'input' }), { target: { value: 'Oak Park Bread' } })
    expect(screen.queryByRole('link', { name: 'Done' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByTestId('edit-unsaved')).toHaveTextContent(/unsaved/i)
    expect(screen.getByRole('link', { name: 'Leave without saving' })).toHaveAttribute(
      'href',
      '/g/oak-park-sourdough-7k3x8m',
    )
  })

  it('from that question, saving saves', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/name/i, { selector: 'input' }), { target: { value: 'Oak Park Bread' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(within(screen.getByTestId('edit-unsaved')).getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Oak Park Bread' })))
  })

  it('the browser asks before the page is left while a change is unsaved, and not once it is saved', async () => {
    renderForm()
    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(leave()).toBe(false)
    fireEvent.change(screen.getByLabelText(/name/i, { selector: 'input' }), { target: { value: 'Oak Park Bread' } })
    expect(leave()).toBe(true)
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(screen.getByTestId('edit-saved')).toBeInTheDocument())
    // The listener comes off in an effect after that render; wait for it.
    await waitFor(() => expect(leave()).toBe(false))
  })
})

describe('#293 — Contact: phone and hours', () => {
  it('saves the phone and hours the owner entered', async () => {
    renderForm({ showHours: true,  initialContact: { phone: null, hours: null } })
    fireEvent.change(screen.getByLabelText(/business phone/i), { target: { value: '916 555 0142' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /monday/i }))
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ contactPhone: '916 555 0142', openingHours: { mon: [{ open: '09:00', close: '17:00' }] } }),
      ),
    )
  })

  it('an emptied phone is sent as cleared', async () => {
    renderForm({ initialContact: { phone: '+19165550142', hours: null } })
    expect(screen.getByLabelText(/business phone/i)).toHaveValue('(916) 555-0142')
    fireEvent.change(screen.getByLabelText(/business phone/i), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: null })))
  })

  it('counts a contact change as unsaved', () => {
    renderForm({ showHours: true,  initialContact: { phone: null, hours: null } })
    fireEvent.click(screen.getByRole('checkbox', { name: /tuesday/i }))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(screen.getByTestId('edit-unsaved')).toBeInTheDocument()
  })
})

describe('#285 — tags can be edited any time', () => {
  it('shows the Page\'s tags', () => {
    renderForm()
    expect(screen.getByTestId('edit-tag-list')).toHaveTextContent('sourdough')
    expect(screen.getByTestId('edit-tag-list')).toHaveTextContent('rye')
  })

  it('saves the new set', async () => {
    renderForm()
    fireEvent.click(screen.getByTestId('edit-tag-remove-rye'))
    fireEvent.change(screen.getByTestId('edit-tag-input'), { target: { value: 'pastry,' } })
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tags: ['sourdough', 'pastry'] })),
    )
  })

  it('counts a tag change as unsaved', () => {
    renderForm()
    fireEvent.click(screen.getByTestId('edit-tag-remove-rye'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(screen.getByTestId('edit-unsaved')).toBeInTheDocument()
  })

  it('will not save a Page with no tags, and says why', async () => {
    renderForm({ initialTags: ['sourdough'] })
    fireEvent.click(screen.getByTestId('edit-tag-remove-sourdough'))
    fireEvent.click(screen.getByTestId('edit-save'))
    expect(await screen.findByTestId('edit-error')).toHaveTextContent(/at least one/i)
    expect(onSave).not.toHaveBeenCalled()
  })
})

// #301 — a draft is finished in Edit. Its link follows the name until it's
// published, and the placeholder name is never shown as if it were real.
describe('#301 — Edit on a draft', () => {
  it('says the link follows the name until you publish, not that it cannot change', () => {
    renderForm({ isDraft: true, initialName: 'untitled-draft', pagePath: '/g/untitled-draft-1a2b3c4d-zz9yy8', slug: 'untitled-draft-1a2b3c4d' })
    const link = screen.getByTestId('edit-link-frozen')
    expect(link).toHaveTextContent(/comes from the name/i)
    expect(link).not.toHaveTextContent(/can.t/i)
    expect(link).not.toHaveTextContent('untitled-draft')
  })

  it('leaves the name empty rather than showing the placeholder', () => {
    renderForm({ isDraft: true, initialName: 'untitled-draft' })
    expect(screen.getByTestId('edit-name')).toHaveValue('')
  })

  it('a live Page still says its link stays put', () => {
    renderForm()
    expect(screen.getByTestId('edit-link-frozen')).toHaveTextContent(/this link can.t/i)
  })
})

// Don, 2026-10-04 — hours and phone are a component: off for a group until added.
describe('hours and phone on Edit, as a component', () => {
  it('a group sees an offer to add them, not the fields', () => {
    renderForm({ contactOn: false, showHours: true })
    expect(screen.queryByTestId('edit-contact')).toBeNull()
    expect(screen.getByRole('button', { name: /add business hours and phone/i })).toBeInTheDocument()
  })

  it('adding them shows the fields and saves the switch', async () => {
    renderForm({ contactOn: false, showHours: true })
    fireEvent.click(screen.getByRole('button', { name: /add business hours and phone/i }))
    expect(screen.getByTestId('edit-contact')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ contactComponent: true })))
  })

  it('a shop has them already, and saving does not touch the switch', async () => {
    renderForm()
    expect(screen.getByTestId('edit-contact')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('contactComponent')
  })
})

describe('hours hidden for now (Don, 2026-10-05)', () => {
  it('Edit offers the business phone, not hours, and leaves stored hours alone', async () => {
    renderForm({ initialContact: { phone: '+19165550142', hours: { mon: [{ open: '09:00', close: '17:00' }] } } })
    expect(screen.queryByRole('checkbox', { name: /monday/i })).toBeNull()
    expect(screen.getByLabelText(/business phone/i)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('openingHours')
  })

  it('a group is offered the phone alone', () => {
    renderForm({ contactOn: false })
    expect(screen.getByRole('button', { name: /^add a business phone$/i })).toBeInTheDocument()
  })
})
