// The edit form.
//
// Issue #180 — the ADDRESS is editable now. What is frozen is the Page's
// LINK, which is a different thing wearing the same word: the old form put
// the URL under a heading that said "Address" and called it unchangeable, so
// an owner reading it was told they could not move house.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
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

const onSave = vi.fn(async (_input: unknown) => ({ ok: true }) as const)
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
    onSave.mockRejectedValueOnce(new Error('these links could not be read: instagram'))
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
