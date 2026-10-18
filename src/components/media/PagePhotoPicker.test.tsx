import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

  // [guards F080.5 partial: the ask at posting; this is the per-photo confirmation] [guards F080.1 partial: the uploader's confirmation, which is how the rule is affirmed; nothing detects a photo]
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

// #835 — F080 criterion 1, whole: the rule is affirmed by the uploader, never detected.
describe('F080.1 — every member photo upload waits on the uploader\'s word, and nothing checks the photo', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8')

  // [guards F080.1]
  it('the Page photo, Page picture and post photo pickers each wait for the confirmation, clear it after every upload, and hand the stored address straight back; the one upload path calls no classifier and holds nothing', async () => {
    // Every member surface that takes a photo uses this picker, and only it reaches the upload.
    for (const f of ['components/group/edit/PageEditor.tsx', 'components/group/PagePosts.tsx', 'components/sell/SellWalkthrough.tsx']) {
      expect(read(f), f).toMatch(/<PagePhotoPicker/)
      expect(read(f), f).not.toMatch(/uploadImage|type="file"|\.upload\(/)
    }
    expect(read('components/group/edit/PageEditor.tsx')).toMatch(/label="Page picture"/)
    expect(read('components/group/PagePosts.tsx')).toMatch(/previewAlt="The photo on this post"/)

    for (const props of [{}, { label: 'Page picture' }, { label: 'Photo (optional)', previewAlt: 'The photo on this post' }]) {
      uploadImage.mockClear()
      const onChange = vi.fn()
      render(<PagePhotoPicker memberId="m1" value={null} onChange={onChange} {...props} />)
      const input = screen.getByTestId('page-photo-input')
      const box = screen.getByLabelText(COPY.photoConfirm)
      for (let i = 1; i <= 2; i++) {
        expect(screen.getByRole('button', { name: /choose a photo/i })).toBeDisabled()
        expect(input).toBeDisabled()
        fireEvent.click(box)
        expect(input).toBeEnabled()
        fireEvent.change(input, { target: { files: [file()] } })
        await waitFor(() => expect(onChange).toHaveBeenCalledTimes(i))
        expect(onChange).toHaveBeenLastCalledWith(URL_A)
        await waitFor(() => expect(box).not.toBeChecked())
      }
      expect(uploadImage).toHaveBeenCalledTimes(2)
      cleanup()
    }

    // Nothing between the file and the stored address: no classifier, no moderation call, no held state.
    const imports = (f: string) => [...read(f).matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    expect(imports('lib/media/upload-image.ts')).toEqual(['@/lib/supabase', './served-url'])
    expect(imports('components/media/PagePhotoPicker.tsx')).toEqual(['react', '@/lib/media/upload-image', '@/lib/copy', '@/app/_actions/origin-actions'])
    expect(read('app/_actions/origin-actions.ts')).not.toMatch(/moderation|assess|hidden/i)
  })
})
