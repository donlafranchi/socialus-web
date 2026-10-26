import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { NewVersionNotice } from './NewVersionNotice'

// #958 (Gmail, Slack, X) — a tab opened before a deploy says a new version is ready, and Refresh reloads it.
const fetchMock = vi.fn()
const reload = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  reload.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const live = (id: string) => fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id }) })
const comeBack = async () => {
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('NewVersionNotice', () => {
  it('says nothing until the tab comes back', () => {
    live('b')
    render(<NewVersionNotice buildId="a" />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/new version/)).toBeNull()
  })

  it('a newer build is live: a quiet line, and Refresh reloads', async () => {
    live('b')
    render(<NewVersionNotice buildId="a" />)
    await comeBack()
    expect(fetchMock).toHaveBeenCalledWith('/api/version', { cache: 'no-store' })
    const note = screen.getByRole('status')
    expect(note).toHaveTextContent('A new version is ready · Refresh')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(reload).toHaveBeenCalled()
  })

  it('checks on focus too', async () => {
    live('b')
    render(<NewVersionNotice buildId="a" />)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(screen.getByRole('status')).toHaveTextContent('A new version is ready')
  })

  it('the same build: nothing', async () => {
    live('a')
    render(<NewVersionNotice buildId="a" />)
    await comeBack()
    expect(fetchMock).toHaveBeenCalled()
    expect(screen.queryByText(/new version/)).toBeNull()
  })

  it('no build to compare (a dev server, or the live one answers none): never asks, or says nothing', async () => {
    live('b')
    render(<NewVersionNotice buildId="" />)
    await comeBack()
    expect(fetchMock).not.toHaveBeenCalled()
    cleanup()
    live('')
    render(<NewVersionNotice buildId="a" />)
    await comeBack()
    expect(screen.queryByText(/new version/)).toBeNull()
  })

  it('a failed check says nothing', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    render(<NewVersionNotice buildId="a" />)
    await comeBack()
    expect(screen.queryByText(/new version/)).toBeNull()
  })

  it('asks at most once a minute', async () => {
    live('a')
    render(<NewVersionNotice buildId="a" />)
    await comeBack()
    await comeBack()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
