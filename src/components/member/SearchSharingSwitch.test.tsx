// #909 — the switch on You: on by default, off means this member's searches are never counted.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SearchSharingSwitch, SEARCH_SHARING_COPY } from './SearchSharingSwitch'

afterEach(cleanup)

describe('SearchSharingSwitch', () => {
  it('shows the stored state and says what it does', () => {
    render(<SearchSharingSwitch on={true} change={vi.fn()} />)
    expect(screen.getByRole('switch', { name: SEARCH_SHARING_COPY.label })).toBeChecked()
    expect(screen.getByText(SEARCH_SHARING_COPY.line)).toBeInTheDocument()
  })

  it('turning it off saves at once', async () => {
    const change = vi.fn().mockResolvedValue({ ok: true, on: false })
    render(<SearchSharingSwitch on={true} change={change} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(change).toHaveBeenCalledWith(false)
    await waitFor(() => expect(screen.getByRole('switch')).not.toBeChecked())
  })

  it('a failed save puts it back and says so', async () => {
    const change = vi.fn().mockResolvedValue({ ok: false })
    render(<SearchSharingSwitch on={true} change={change} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't go through. Mind trying again?")
    expect(screen.getByRole('switch')).toBeChecked()
  })
})
