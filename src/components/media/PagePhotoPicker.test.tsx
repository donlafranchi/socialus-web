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

const { recordUploadAction } = vi.hoisted(() => ({ recordUploadAction: vi.fn(async () => undefined) }))
vi.mock('@/app/_actions/origin-actions', () => ({ recordUploadAction }))

import { PagePhotoPicker } from './PagePhotoPicker'
import { COPY } from '@/lib/copy'

const URL_A = 'https://x.supabase.co/storage/v1/object/public/media/m/a.webp'
const confirm = () => fireEvent.click(screen.getByLabelText(COPY.photoConfirm))
const file = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

afterEach(cleanup)

beforeEach(() => {
  uploadImage.mockReset()
  uploadImage.mockResolvedValue({ url: URL_A })
})

describe('F070 · T145 — PagePhotoPicker', () => {
  // [guards F102.13 partial: uploads; posts are recorded by the post action]
  it('F102 — a stored photo records where it came from, and a failed record does not fail the upload', async () => {
    const onChange = vi.fn()
    recordUploadAction.mockClear()
    recordUploadAction.mockRejectedValueOnce(new Error('down'))
    render(<PagePhotoPicker memberId="m1" value={null} onChange={onChange} />)
    confirm()
    fireEvent.change(screen.getByTestId('page-photo-input'), { target: { files: [file()] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(URL_A))
    expect(recordUploadAction).toHaveBeenCalledWith({ url: URL_A })
  })

  it('F102 — a photo that did not upload records nothing', async () => {
    recordUploadAction.mockClear()
    uploadImage.mockRejectedValueOnce(new Error('no'))
    render(<PagePhotoPicker memberId="m1" value={null} onChange={vi.fn()} />)
    confirm()
    fireEvent.change(screen.getByTestId('page-photo-input'), { target: { files: [file()] } })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(recordUploadAction).not.toHaveBeenCalled()
  })

  // [guards F080.5 partial: the ask at posting; this is the per-photo confirmation]
  it('F080 — choosing a photo waits until the uploader confirms it shows no children', () => {
    render(<PagePhotoPicker memberId="m1" value={null} onChange={vi.fn()} />)
    const choose = screen.getByRole('button', { name: /choose a photo/i })
    expect(choose).toBeDisabled()
    fireEvent.click(screen.getByLabelText(COPY.photoConfirm))
    expect(choose).toBeEnabled()
  })

  it('F080 — each photo asks again: the confirmation clears after an upload', async () => {
    render(<PagePhotoPicker memberId="m1" value={null} onChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(COPY.photoConfirm))
    confirm()
    fireEvent.change(screen.getByTestId('page-photo-input'), { target: { files: [file()] } })
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByLabelText(COPY.photoConfirm)).not.toBeChecked())
  })

  it('uploads the chosen file and reports the URL', async () => {
    const onChange = vi.fn()
    render(<PagePhotoPicker memberId="m1" value={null} onChange={onChange} />)

    confirm()
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

    confirm()
    fireEvent.change(screen.getByTestId('page-photo-input'), { target: { files: [file()] } })

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('recovers: a second attempt after a failure clears the error', async () => {
    uploadImage.mockRejectedValueOnce(new Error('network down'))
    const onChange = vi.fn()
    render(<PagePhotoPicker memberId="m1" value={null} onChange={onChange} />)

    confirm()
    fireEvent.change(screen.getByTestId('page-photo-input'), { target: { files: [file()] } })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    confirm()
    fireEvent.change(screen.getByTestId('page-photo-input'), { target: { files: [file()] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(URL_A))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// Bug — Don saw a bare file input on production with nothing to say it could
// be pressed. The control is a button that looks like one and says what it does.
describe('the photo control looks and acts like a button', () => {
  it('is a button named for what it does, with a pointer and a visible focus ring', () => {
    render(<PagePhotoPicker memberId="m1" value={null} onChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: /choose a photo/i })
    expect(button.className).toMatch(/\bbtn-secondary\b/)
    expect(button.className).toMatch(/\bcursor-pointer\b/)
    expect(button.className).toMatch(/\bfocus-visible:ring-2\b/)
  })

  it('opens the file chooser when pressed', () => {
    render(<PagePhotoPicker memberId="m1" value={null} onChange={vi.fn()} />)
    const input = screen.getByTestId('page-photo-input') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    confirm()
    fireEvent.click(screen.getByRole('button', { name: /choose a photo/i }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('says "Change photo" once there is one', () => {
    render(<PagePhotoPicker memberId="m1" value={URL_A} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /change photo/i })).toBeInTheDocument()
  })

  it('keeps the bare input out of the tab order and out of sight', () => {
    render(<PagePhotoPicker memberId="m1" value={null} onChange={vi.fn()} />)
    const input = screen.getByTestId('page-photo-input')
    expect(input).toHaveAttribute('tabindex', '-1')
    expect(input.className).toMatch(/\bsr-only\b/)
  })
})
