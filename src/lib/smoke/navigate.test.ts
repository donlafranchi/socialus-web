// #500 — the overnight live smoke failed on ONE navigation: ownerBusiness at 1280px
// timed out waiting for `load` on "/" (55 passed, 59 skipped by design). `load`
// waits on every external resource a page pulls in (the map's, at 1280px), so a
// single slow third-party request can fail a screen that is fine. The smoke now
// waits for the document, retries a timed-out navigation once, and records a
// repeat timeout as a problem on that route instead of throwing.

import { describe, it, expect, vi } from 'vitest'
import { navigate } from './navigate'

const ok = (status: number) => ({ status: () => status })
const timeout = () => Object.assign(new Error('page.goto: Timeout 30000ms exceeded.'), { name: 'TimeoutError' })

describe('navigate', () => {
  it('waits for the document, not for every external resource, and reports the status', async () => {
    const goto = vi.fn().mockResolvedValue(ok(200))
    await expect(navigate({ goto }, '/')).resolves.toEqual({ status: 200, timedOut: false, retried: false })
    expect(goto).toHaveBeenCalledWith('/', expect.objectContaining({ waitUntil: 'domcontentloaded' }))
  })

  it('retries a timed-out navigation once and uses the second answer', async () => {
    const goto = vi.fn().mockRejectedValueOnce(timeout()).mockResolvedValueOnce(ok(200))
    await expect(navigate({ goto }, '/')).resolves.toEqual({ status: 200, timedOut: false, retried: true })
    expect(goto).toHaveBeenCalledTimes(2)
  })

  it('a second timeout is a result, never a throw, so the other screens still run', async () => {
    const goto = vi.fn().mockRejectedValue(timeout())
    await expect(navigate({ goto }, '/')).resolves.toEqual({ status: 0, timedOut: true, retried: true })
    expect(goto).toHaveBeenCalledTimes(2)
  })

  it('an HTTP error is an answer: it is reported once and never retried', async () => {
    const goto = vi.fn().mockResolvedValue(ok(500))
    await expect(navigate({ goto }, '/')).resolves.toEqual({ status: 500, timedOut: false, retried: false })
    expect(goto).toHaveBeenCalledTimes(1)
  })

  it('any other error is still an error', async () => {
    const goto = vi.fn().mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'))
    await expect(navigate({ goto }, '/')).rejects.toThrow('ERR_NAME_NOT_RESOLVED')
  })

  it('a navigation with no response (a download, an abort) reports status 0', async () => {
    const goto = vi.fn().mockResolvedValue(null)
    await expect(navigate({ goto }, '/')).resolves.toMatchObject({ status: 0, timedOut: false })
  })
})
