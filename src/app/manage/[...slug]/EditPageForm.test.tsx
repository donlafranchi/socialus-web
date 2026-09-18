// The edit form. Two things carry the change: a live Page's address is shown
// and frozen with the reason given, and a failed save says why.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { EditPageForm } from './EditPageForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const onSave = vi.fn(async () => ({ ok: true }) as const)

function renderForm(over: Partial<Parameters<typeof EditPageForm>[0]> = {}) {
  onSave.mockClear()
  return render(
    <EditPageForm
      groupId="g1"
      memberId="m1"
      pagePath="/p/oak-park-sourdough"
      slug="oak-park-sourdough"
      initialName="Oak Park Sourdough"
      initialDescription="Real bread."
      initialPhotoUrl={null}
      initialSocialLinks={{}}
      onSave={onSave}
      {...over}
    />,
  )
}

afterEach(cleanup)

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

describe('the address is frozen, and says so', () => {
  // A field that quietly is not there reads as a missing feature. Don came to
  // say there was no way to edit a Page; silence is what that sounds like.
  it('shows the address, uneditable, with the reason', () => {
    renderForm()
    const block = screen.getByTestId('edit-address-frozen')
    expect(block).toHaveTextContent('/p/oak-park-sourdough')
    expect(block).toHaveTextContent(/would break it/i)
    expect(block.querySelector('input')).toBeNull()
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
