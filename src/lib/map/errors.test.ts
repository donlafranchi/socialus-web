import { describe, it, expect, vi } from 'vitest'
import { handleMapErrors, isNetworkError } from './errors'

type Handler = (e: { error?: Error }) => void
const fakeMap = () => {
  const handlers: Record<string, Handler> = {}
  return { on: (type: string, h: Handler) => void (handlers[type] = h), fire: (e: { error?: Error }) => handlers.error!(e) }
}

describe('map errors (#790)', () => {
  it('reads a tile or style fetch that failed on the network as a network error', () => {
    for (const m of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'Failed to fetch https://api.mapbox.com/v4/x.mvt']) {
      expect(isNetworkError({ error: new Error(m) }), m).toBe(true)
    }
    expect(isNetworkError({ error: new Error('Style is not done loading') })).toBe(false)
    expect(isNetworkError({})).toBe(false)
  })
  it('a dropped tile is a warning, not a console error; anything else is still an error', () => {
    const map = fakeMap()
    const log = { warn: vi.fn(), error: vi.fn() }
    handleMapErrors(map, log)
    map.fire({ error: new Error('Failed to fetch') })
    expect(log.error).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledTimes(1)
    map.fire({ error: new Error('Style is not done loading') })
    expect(log.error).toHaveBeenCalledTimes(1)
  })
})
