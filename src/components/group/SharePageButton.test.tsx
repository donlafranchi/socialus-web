import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SharePageButton } from './SharePageButton'

// #409 — Share: the phone's share sheet where there is one, otherwise copy the link.

const share = vi.fn()
const writeText = vi.fn()
afterEach(() => {
  cleanup()
  Object.assign(navigator, { share: undefined, clipboard: undefined })
})
beforeEach(() => {
  vi.clearAllMocks()
  share.mockResolvedValue(undefined)
  writeText.mockResolvedValue(undefined)
})

const tap = () => fireEvent.click(screen.getByRole('button', { name: 'Share' }))

describe('#409 — Share a Page', () => {
  it('opens the share sheet with the Page name and its full address', async () => {
    Object.assign(navigator, { share, clipboard: { writeText } })
    render(<SharePageButton title="Oak Park Sourdough" path="/g/oak-park-sourdough-7k3x8m" />)
    tap()
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Oak Park Sourdough', url: `${window.location.origin}/g/oak-park-sourdough-7k3x8m` }))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copies the link and says so where there is no share sheet', async () => {
    Object.assign(navigator, { clipboard: { writeText } })
    render(<SharePageButton title="Oak Park Sourdough" path="/g/oak-park-sourdough-7k3x8m" />)
    tap()
    expect(await screen.findByTestId('toast')).toHaveTextContent('Link copied')
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/g/oak-park-sourdough-7k3x8m`)
  })

  it('stays quiet when the share sheet is dismissed', async () => {
    share.mockRejectedValue(Object.assign(new Error('cancel'), { name: 'AbortError' }))
    Object.assign(navigator, { share, clipboard: { writeText } })
    render(<SharePageButton title="x" path="/g/x-1" />)
    tap()
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(screen.queryByTestId('toast')).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
  })
})
