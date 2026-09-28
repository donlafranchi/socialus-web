import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// F070 · T145 — the control that actually puts a photo on a Page.
//
// `lib/media/upload-image` has existed since T120 with zero callers. This is
// the first one. The split is deliberate: that module owns resizing, encoding
// and the storage put; this component owns what a person sees while it happens
// and what they can do about it.
//
// Three things it has to get right, because each is a real failure mode:
//
//   1. **An upload that fails says so.** A silent failure looks identical to a
//      slow one, and the member re-taps until they give up.
//   2. **Removing is possible and distinct from never choosing.** It reports
//      null, which `group.update_draft` writes as an explicit clear.
//   3. **It never blocks the step.** A photo is optional; a failed upload must
//      not trap someone in the composer.

const { uploadImage } = vi.hoisted(() => ({ uploadImage: vi.fn() }))
vi.mock('@/lib/media/upload-image', () => ({ uploadImage }))

import { PagePhotoPicker } from './PagePhotoPicker'

const URL_A = 'https://x.supabase.co/storage/v1/object/public/media/m/a.webp'
const file = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

afterEach(cleanup)

beforeEach(() => {
  uploadImage.mockReset()
  uploadImage.mockResolvedValue({ url: URL_A })
})

describe('F070 · T145 — PagePhotoPicker', () => {
  it('uploads the chosen file and reports the URL', async () => {
    const onChange = vi.fn()
    render(<PagePhotoPicker memberId="m1" value={null} onChange={onChange} />)

    fireEvent.change(screen.getByTestId('page-photo-input'), { target: { files: [file()] } })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(URL_A))
    expect(uploadImage).toHaveBeenCalledTimes(1)
  })

  it('shows the photo once there is one', () => {
    render(<PagePhotoPicker memberId="m1" value={URL_A} onChange={vi.fn()} />)
    expect(screen.getByTestId('page-photo-preview')).toHaveAttribute('src', URL_A)
  })

  it('removing reports null — not the same as never choosing', async () => {
    const onChange = vi.fn()
    render(<PagePhotoPicker memberId="m1" value={URL_A} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('offers no remove control when there is no photo', () => {
    render(<PagePhotoPicker memberId="m1" value={null} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })

  it('says so when the upload fails, and reports nothing', async () => {
    uploadImage.mockRejectedValue(new Error('network down'))
    const onChange = vi.fn()
    render(<PagePhotoPicker memberId="m1" value={null} onChange={onChange} />)

    fireEvent.change(screen.getByTestId('page-photo-input'), { target: { files: [file()] } })

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('recovers: a second attempt after a failure clears the error', async () => {
    uploadImage.mockRejectedValueOnce(new Error('network down'))
    const onChange = vi.fn()
    render(<PagePhotoPicker memberId="m1" value={null} onChange={onChange} />)

    fireEvent.change(screen.getByTestId('page-photo-input'), { target: { files: [file()] } })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('page-photo-input'), { target: { files: [file()] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(URL_A))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // #237 — the browser's bare "Choose File / No file chosen" did not read as
  // the thing to press.
  it('offers a named button to choose a photo', () => {
    render(<PagePhotoPicker memberId="m1" value={null} onChange={() => {}} />)
    expect(screen.getByText('Choose a photo')).toBeInTheDocument()
  })
})
