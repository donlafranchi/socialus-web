import { describe, it, expect } from 'vitest'
import { sentryOptions } from './sentry-options'

describe('Sentry reports only from production, traces sampled (2026-11-16 load re-run)', () => {
  it('is on for a Vercel production build', () => {
    expect(sentryOptions('production').enabled).toBe(true)
  })

  it('is off for CI, local and preview builds, so load runs and tests never reach the production project', () => {
    for (const env of [undefined, '', 'preview', 'development']) expect(sentryOptions(env).enabled).toBe(false)
  })

  it('samples one trace in ten: 100% cost a signed-in page 6x its p95 at 50 viewers', () => {
    expect(sentryOptions('production').tracesSampleRate).toBe(0.1)
  })
})

describe('Every report is scrubbed before it leaves (#1455, rule from #490)', () => {
  const opts = sentryOptions('production')

  it('sends no default personal data', () => {
    expect(opts.sendDefaultPii).toBe(false)
  })

  it('cuts emails, phone numbers and query strings out of an error', () => {
    const event = {
      message: 'Sign-in failed for maya@example.com, call 916-555-0134',
      request: { url: 'https://www.socialus.org/explore?q=maya', query_string: 'q=maya' },
      exception: { values: [{ type: 'Error', value: 'No row for maya@example.com' }] },
    }
    const out = JSON.stringify(opts.beforeSend(event as never))
    expect(out).not.toMatch(/maya|555-0134|\?q=|query_string/)
    expect(out).toContain('https://www.socialus.org/explore')
  })

  it('cuts query strings and emails out of a sampled trace', () => {
    const event = {
      type: 'transaction',
      transaction: '/explore?q=maya',
      request: { url: 'https://www.socialus.org/explore?q=maya', query_string: 'q=maya' },
      user: { email: 'maya@example.com' },
      spans: [
        { description: 'GET https://api.example.com/rest/v1/pages?name=eq.maya%40example.com', data: { url: 'https://api.example.com/rest/v1/pages?name=eq.maya', 'http.query': '?name=eq.maya', 'http.method': 'GET' } },
      ],
    }
    const out = opts.beforeSendTransaction(event as unknown as Parameters<typeof opts.beforeSendTransaction>[0])
    const text = JSON.stringify(out)
    expect(text).not.toMatch(/maya|\?q=|\?name=|query_string/)
    expect(out.transaction).toBe('/explore')
    expect(out.spans![0]!.data!['http.method']).toBe('GET')
  })
})
