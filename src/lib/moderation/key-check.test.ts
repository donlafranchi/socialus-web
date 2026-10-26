// The operator's check that the moderation key works, without filing a fake report: one free call to
// Anthropic's models list (it checks the key and costs no tokens).

import { describe, it, expect, vi } from 'vitest'
import { checkModerationKey } from './key-check'

const ENV = { ANTHROPIC_MODERATION_KEY: 'sk-test' }
const reply = (status: number) => vi.fn(async () => new Response('{}', { status }))

describe('checkModerationKey', () => {
  it('says connected when Anthropic accepts the key', async () => {
    expect(await checkModerationKey({ env: ENV, fetch: reply(200) })).toBe('connected')
  })

  it('makes one minimal call: the models list, with the key and no tokens spent', async () => {
    const f = reply(200)
    await checkModerationKey({ env: ENV, fetch: f })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=1')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test')
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('says not set when there is no key, and calls nothing', async () => {
    const f = reply(200)
    expect(await checkModerationKey({ env: {}, fetch: f })).toBe('not_set')
    expect(await checkModerationKey({ env: { ANTHROPIC_MODERATION_KEY: '  ' }, fetch: f })).toBe('not_set')
    expect(f).not.toHaveBeenCalled()
  })

  it('says rejected when Anthropic refuses the key', async () => {
    expect(await checkModerationKey({ env: ENV, fetch: reply(401) })).toBe('rejected')
    expect(await checkModerationKey({ env: ENV, fetch: reply(403) })).toBe('rejected')
  })

  it('says unreachable, not rejected, when the answer says nothing about the key', async () => {
    expect(await checkModerationKey({ env: ENV, fetch: reply(500) })).toBe('unreachable')
    expect(await checkModerationKey({ env: ENV, fetch: reply(429) })).toBe('unreachable')
    expect(await checkModerationKey({ env: ENV, fetch: vi.fn(async () => { throw new Error('offline') }) })).toBe('unreachable')
  })

  it('never puts the key in anything it returns', async () => {
    const out = await checkModerationKey({ env: ENV, fetch: reply(401) })
    expect(out).not.toContain('sk-test')
  })
})
