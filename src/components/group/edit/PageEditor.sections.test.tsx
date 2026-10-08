// #412 — what the old one-form Edit Page proved, now proved of the sheet each
// card opens: where it is (#180, #348), handles not URLs, the phone (#293),
// what the Page shows, and a failed save that says why.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PageEditorProvider, usePageEditor, type EditorInitial, type Section } from './PageEditor'
import { emptyWhere } from '@/components/locations/WhereFields'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/media/PagePhotoPicker', () => ({ PagePhotoPicker: () => null }))
vi.mock('@/lib/geocoding', () => ({ geocode: vi.fn(async () => []), GeocodingUnavailableError: class extends Error {} }))
const { createLocationAction, metroAnchorPlaceAction, searchPlacesAction, placeForPointAction } = vi.hoisted(() => ({
  createLocationAction: vi.fn(async (_i: unknown) => ({ ok: true, data: { id: 'loc-new', label: 'x' } }) as unknown),
  metroAnchorPlaceAction: vi.fn(async () => ({ ok: true, data: { id: 'pl-sac', name: 'Sacramento' } })),
  searchPlacesAction: vi.fn(async () => ({ ok: true, data: [] as unknown[] })),
  placeForPointAction: vi.fn(async () => ({ ok: true, data: { id: 'pl-curtis', name: 'Curtis Park' } })),
}))
vi.mock('@/app/_actions/location-actions', () => ({ createLocationAction, metroAnchorPlaceAction, searchPlacesAction, placeForPointAction }))
vi.mock('@/components/locations/PinAdjustMap', () => ({
  PinAdjustMap: ({ onChange }: { onChange: (c: [number, number]) => void }) => (
    <button type="button" data-testid="pin-moved" onClick={() => onChange([-121.47, 38.55])} />
  ),
}))
vi.mock('@/components/locations/AreaPickMap', () => ({
  AreaPickMap: ({ onPick }: { onPick: (p: { placeId: string; name: string }) => void }) => (
    <button type="button" data-testid="town-tapped" onClick={() => onPick({ placeId: 'pl-davis', name: 'Davis' })} />
  ),
}))

const onSave = vi.fn(async (_i: unknown): Promise<{ ok: true } | { ok: false; message: string }> => ({ ok: true }))
const initial: EditorInitial = {
  groupId: 'g1',
  pagePath: '/g/7k3x8m',
  memberId: 'm1',
  name: 'Oak Park Sourdough',
  description: 'Real bread.',
  photoUrl: null,
  socialLinks: {},
  tags: ['sourdough'],
  contact: { phone: null, hours: null },
  contactOn: true,
  addressLabel: '3117 Broadway, Sacramento, CA',
  kind: 'business',
  purpose: 'sell',
  productsOn: true,
  where: emptyWhere,
}

function Opener({ section }: { section: Section }) {
  const ctx = usePageEditor()
  return <button onClick={() => ctx!.open(section)}>open</button>
}
function open(section: Section, over: Partial<EditorInitial> = {}) {
  render(
    <PageEditorProvider initial={{ ...initial, ...over }} onSave={onSave}>
      <Opener section={section} />
    </PageEditorProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
}
const save = () => fireEvent.click(screen.getByTestId('sheet-save'))

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test')
  onSave.mockClear()
  createLocationAction.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('Where: the address, which the owner can change', () => {
  const dropAPin = async () => {
    fireEvent.click(screen.getByRole('radio', { name: /people come to me/i }))
    fireEvent.click(screen.getByRole('button', { name: /drop a pin/i }))
    fireEvent.click((await screen.findByTestId('pin-moved')))
  }

  it('shows where the Page is now', async () => {
    open('where')
    expect(screen.getByRole('dialog')).toHaveTextContent('Now: 3117 Broadway, Sacramento, CA')
  })

  it('People come to me: saves the pin as the Location, with how to find us', async () => {
    open('where')
    await dropAPin()
    fireEvent.change(screen.getByRole('textbox', { name: /how to find us/i }), { target: { value: 'Behind the barn' } })
    save()
    await waitFor(() => expect(createLocationAction).toHaveBeenCalled())
    expect(createLocationAction).toHaveBeenCalledWith(expect.objectContaining({ label: 'Near Curtis Park' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ anchorLocationId: 'loc-new', whereMode: 'visit', howToFind: 'Behind the barn', serviceAreaPlaceIds: [] }),
      ),
    )
  })

  it('People come to me, already saved: a new "How to find us" saves without setting the pin again', async () => {
    open('where', {
      where: {
        mode: 'visit',
        visit: { pin: null, label: null, howToFind: 'Old note', areaOnly: false, area: null },
        travel: { towns: [] },
        roaming: { usuallyAround: '' },
      },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /how to find us/i }), { target: { value: 'Side door' } })
    save()
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(createLocationAction).not.toHaveBeenCalled()
    expect(onSave.mock.calls[0]![0]).toEqual(expect.objectContaining({ whereMode: 'visit', howToFind: 'Side door' }))
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty('anchorLocationId')
  })

  it('I go to them: anchors on the metro and saves the towns', async () => {
    open('where')
    fireEvent.click(screen.getByRole('radio', { name: /i go to them/i }))
    fireEvent.click((await screen.findByTestId('town-tapped')))
    save()
    await waitFor(() => expect(createLocationAction).toHaveBeenCalledWith({ label: 'Sacramento', neighborhoodId: 'pl-sac' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ whereMode: 'travel', serviceAreaPlaceIds: ['pl-davis'] })))
  })

  it('It moves: saves usually around', async () => {
    open('where')
    fireEvent.click(screen.getByRole('radio', { name: /it moves/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /usually around/i }), { target: { value: 'Midtown markets' } })
    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ whereMode: 'roaming', usuallyAround: 'Midtown markets' })))
  })

  it('does not move the Page when the Location could not be made', async () => {
    createLocationAction.mockResolvedValueOnce({ ok: false, message: 'A Location needs a real address or a neighbourhood.', code: 'location_needs_place' })
    open('where')
    await dropAPin()
    save()
    expect(await screen.findByRole('alert')).toHaveTextContent(/real address/i)
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('Links: handles, not URLs', () => {
  const addInstagram = () => fireEvent.change(screen.getByTestId('social-add'), { target: { value: 'instagram' } })

  it('accepts a bare handle and saves the composed URL', async () => {
    open('links')
    addInstagram()
    fireEvent.change(screen.getByTestId('social-instagram'), { target: { value: 'oakpark' } })
    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ socialLinks: { instagram: 'https://instagram.com/oakpark' } })))
  })

  it('shows a stored URL back as the handle', async () => {
    open('links', { socialLinks: { instagram: 'https://instagram.com/clara' } })
    expect(screen.getByTestId('social-instagram')).toHaveValue('clara')
  })

  it('names the field that is wrong rather than failing opaquely', async () => {
    open('links')
    addInstagram()
    fireEvent.change(screen.getByTestId('social-instagram'), { target: { value: 'has space' } })
    save()
    await waitFor(() => expect(screen.getAllByRole('alert').some((a) => /instagram/i.test(a.textContent ?? ''))).toBe(true))
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('Business phone (#293)', () => {
  it('saves the phone entered', async () => {
    open('contact')
    fireEvent.change(screen.getByTestId('edit-phone'), { target: { value: '916 555 0142' } })
    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: '916 555 0142' })))
  })

  it('an emptied phone is sent as cleared', async () => {
    open('contact', { contact: { phone: '+19165550142', hours: null } })
    fireEvent.change(screen.getByTestId('edit-phone'), { target: { value: '' } })
    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: null })))
  })
})

describe('What your Page shows', () => {
  it('turning the phone on saves the switch', async () => {
    open('components', { contactOn: false })
    fireEvent.click(screen.getAllByRole('switch')[0]!)
    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ contactComponent: true, productsComponent: true })))
  })
})

describe('a failed save says why', () => {
  it('shows the handler message rather than a generic failure', async () => {
    onSave.mockResolvedValueOnce({ ok: false, message: 'these links could not be read: instagram' })
    open('description')
    save()
    expect(await screen.findByRole('alert')).toHaveTextContent(/instagram/)
    expect(screen.queryByText(/something went wrong/i)).toBeNull()
  })
})
