import { describe, it, expect, vi } from 'vitest'
import { preloadWhenIdle } from './preload-when-idle'

// #978 — the map's code loads while the phone is idle on Explore, so Show the map waits only on drawing.
type Win = Parameters<typeof preloadWhenIdle>[1]
const win = (saveData?: boolean) => {
  const idle: (() => void)[] = []
  const w = {
    navigator: { connection: saveData === undefined ? undefined : { saveData } },
    requestIdleCallback: vi.fn((cb: () => void) => idle.push(cb)),
    cancelIdleCallback: vi.fn(),
    setTimeout: vi.fn((cb: () => void) => idle.push(cb)),
    clearTimeout: vi.fn(),
  }
  return { w: w as unknown as Win, raw: w, runIdle: () => idle.splice(0).forEach((cb) => cb()) }
}

describe('preloadWhenIdle', () => {
  it('loads once the phone is idle, not before', () => {
    const load = vi.fn(async () => ({}))
    const { w, runIdle } = win(false)
    preloadWhenIdle(load, w)
    expect(load).not.toHaveBeenCalled()
    runIdle()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('skips on Data Saver', () => {
    const load = vi.fn(async () => ({}))
    const { w, runIdle } = win(true)
    preloadWhenIdle(load, w)
    runIdle()
    expect(load).not.toHaveBeenCalled()
  })

  it('falls back to a timer where idle callbacks are missing (Safari)', () => {
    const load = vi.fn(async () => ({}))
    const { w, raw, runIdle } = win()
    delete (raw as Partial<typeof raw>).requestIdleCallback
    preloadWhenIdle(load, w)
    expect(raw.setTimeout).toHaveBeenCalled()
    runIdle()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('can be cancelled when Explore unmounts first, and swallows a failed load', async () => {
    const { w, raw } = win(false)
    preloadWhenIdle(async () => ({}), w)()
    expect(raw.cancelIdleCallback).toHaveBeenCalled()
    const failing = win(false)
    preloadWhenIdle(() => Promise.reject(new Error('offline')), failing.w)
    expect(() => failing.runIdle()).not.toThrow()
  })
})
