// #1044, #1485 — venue pages read politely: Retry-After honoured, waits jittered, a bot checkpoint never retried,
// one host paced, and an Issue only after STRIKES_TO_FILE mornings in a row.
import { describe, expect, it } from 'vitest'
import { FetchError, getWithRetries, hostPacer, retryAfterMs, STRIKES_TO_FILE, tallyStrikes } from './polite-fetch'

const ok = (body = 'page') => new Response(body, { status: 200 })
const res = (status: number, headers: Record<string, string> = {}) => new Response('', { status, headers })
const run = (answers: (Response | Error)[], random = () => 0.5) => {
  const waits: number[] = []
  let n = 0
  const f = async () => {
    const a = answers[n++]!
    if (a instanceof Error) throw a
    return a
  }
  return { waits, tries: () => n, read: () => getWithRetries('https://v.test/', f, async (ms) => void waits.push(ms), { random }) }
}

describe('getWithRetries', () => {
  it('reads a page that answers 504 twice and then 200', async () => {
    const r = run([res(504), res(502), ok('shows')])
    expect(await r.read()).toBe('shows')
    expect(r.waits).toEqual([5000, 15000])
  })
  it('jitters each wait between half and one and a half times its base', async () => {
    const lo = run([res(504), res(504), ok()], () => 0)
    await lo.read()
    expect(lo.waits).toEqual([2500, 7500])
    const hi = run([res(504), ok()], () => 0.999)
    await hi.read()
    expect(hi.waits[0]).toBeGreaterThan(7400)
  })
  it('retries a dead connection too, and gives up after three tries with the last error, to be tried again later', async () => {
    const r = run([new Error('fetch failed'), res(504), res(503)])
    const e = await r.read().catch((x) => x)
    expect(e).toBeInstanceOf(FetchError)
    expect(e.message).toBe('HTTP 503')
    expect(e.later).toBe(true)
    expect(r.tries()).toBe(3)
  })
  it('waits as long as a 429 or 503 asks (Retry-After), then reads', async () => {
    const r = run([res(429, { 'retry-after': '20' }), res(503, { 'retry-after': '7' }), ok('shows')])
    expect(await r.read()).toBe('shows')
    expect(r.waits).toEqual([20_000, 7_000])
  })
  it('a 429 with no Retry-After backs off like a server error, and stays retryable later in the run', async () => {
    const r = run([res(429), res(429), res(429)])
    const e = await r.read().catch((x) => x)
    expect(e.message).toBe('rate limited (429)')
    expect(e.later).toBe(true)
    expect(r.waits).toEqual([5000, 15000])
  })
  it('does not sit out a long Retry-After: it leaves the venue for later', async () => {
    const r = run([res(429, { 'retry-after': '3600' })])
    const e = await r.read().catch((x) => x)
    expect(e.message).toMatch(/rate limited \(429\).*3600 s/)
    expect(e.later).toBe(true)
    expect(r.tries()).toBe(1)
  })
  it('never retries a bot checkpoint, and says so', async () => {
    for (const h of ['x-vercel-mitigated', 'cf-mitigated'].map((k): Record<string, string> => ({ [k]: 'challenge' }))) {
      const r = run([res(429, h)])
      const e = await r.read().catch((x) => x)
      expect(e.message).toMatch(/bot checkpoint/)
      expect(e.later).toBe(false)
      expect(r.tries()).toBe(1)
    }
  })
  it('does not retry the venue saying no: 403 or 404', async () => {
    for (const status of [403, 404]) {
      const r = run([res(status)])
      const e = await r.read().catch((x) => x)
      expect(e.message).toBe(`HTTP ${status}`)
      expect(e.later).toBe(false)
      expect(r.tries()).toBe(1)
    }
  })
  it('sends the identifying User-Agent', async () => {
    let ua = ''
    await getWithRetries('https://v.test/', async (_u, init) => ((ua = new Headers(init.headers).get('user-agent')!), ok()), async () => {})
    expect(ua).toMatch(/^SocialUsBot\/1\.0 \(\+https:\/\/socialus\.org/)
  })
})

describe('retryAfterMs', () => {
  const now = Date.parse('2026-11-27T12:00:00Z')
  it('reads seconds or an HTTP date, and nothing else', () => {
    expect(retryAfterMs('30', now)).toBe(30_000)
    expect(retryAfterMs('Fri, 27 Nov 2026 12:00:45 GMT', now)).toBe(45_000)
    expect(retryAfterMs('Fri, 27 Nov 2026 11:00:00 GMT', now)).toBe(0)
    expect(retryAfterMs(null, now)).toBeNull()
    expect(retryAfterMs('soon', now)).toBeNull()
  })
})

describe('hostPacer', () => {
  it('spaces requests to one host by the gap, and leaves other hosts alone', async () => {
    let t = 0
    const slept: number[] = []
    const pace = hostPacer(async (ms) => void ((t += ms), slept.push(ms)), () => t)
    await pace('https://a.test/robots.txt', 3000)
    await pace('https://a.test/shows', 3000)
    await pace('https://b.test/', 3000)
    t += 1000
    await pace('https://a.test/next', 3000)
    expect(slept).toEqual([3000, 2000])
  })
})

describe('tallyStrikes', () => {
  it('counts mornings in a row, clears a venue that reads, and files only at the threshold', () => {
    let s: Record<string, number> = {}
    for (let i = 1; i < STRIKES_TO_FILE; i++) {
      const t = tallyStrikes(s, ['Ok Venue'], ['Flaky'])
      expect(t.file).toEqual([])
      s = t.strikes
    }
    const t = tallyStrikes({ ...s, 'Ok Venue': 2 }, ['Ok Venue'], ['Flaky'])
    expect(t.file).toEqual(['Flaky'])
    expect(t.strikes).toEqual({ Flaky: STRIKES_TO_FILE })
    expect(tallyStrikes(t.strikes, ['Flaky'], []).strikes).toEqual({})
  })
  it('leaves venues this run did not read (one venue by hand) as they were', () => {
    expect(tallyStrikes({ A: 2 }, ['B'], []).strikes).toEqual({ A: 2 })
  })
})
