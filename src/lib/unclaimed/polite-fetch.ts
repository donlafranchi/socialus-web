// #1044, #1485 — how the venue import reads other people's sites: identified, paced per host, Retry-After honoured,
// waits jittered, a bot checkpoint never retried or worked around, and an Issue only after a few bad mornings in a row.

export const IMPORT_UA = 'SocialUsBot/1.0 (+https://socialus.org; venue calendars)'
/** Longest Retry-After sat out inside a read; a longer ask leaves the venue for later in the run or the next morning. */
const RETRY_AFTER_CAP = 60_000
export const STRIKES_TO_FILE = 3

/** `later`: worth another try later in this run (rate limits, server errors, dead connections); not a refusal or a checkpoint. */
export class FetchError extends Error {
  constructor(message: string, readonly later: boolean) {
    super(message)
  }
}

export function retryAfterMs(h: string | null, now = Date.now()): number | null {
  if (!h) return null
  if (/^\d+$/.test(h.trim())) return Number(h) * 1000
  const t = Date.parse(h)
  return Number.isNaN(t) ? null : Math.max(0, t - now)
}

const checkpoint = (res: Response) => ['x-vercel-mitigated', 'cf-mitigated'].some((h) => res.headers.get(h)?.toLowerCase() === 'challenge')

/** Three tries, 5 s then 15 s apart (each jittered ±50%), or as long as a 429/503 asks. 403/404 is the venue's answer. */
export async function getWithRetries(
  url: string,
  f: (url: string, init: RequestInit) => Promise<Response>,
  sleep: (ms: number) => Promise<unknown>,
  { waits = [5_000, 15_000], random = Math.random }: { waits?: number[]; random?: () => number } = {},
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    let failure: FetchError
    let wait: number | null = null
    try {
      const res = await f(url, { headers: { 'user-agent': IMPORT_UA, accept: 'text/html,application/json,text/calendar,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) })
      if (checkpoint(res)) throw new FetchError(`bot checkpoint (HTTP ${res.status}): the site asks for a browser, so it is not read`, false)
      if (res.ok) return await res.text()
      const label = res.status === 429 ? 'rate limited (429)' : `HTTP ${res.status}`
      if (res.status === 429 || res.status === 503) {
        wait = retryAfterMs(res.headers.get('retry-after'))
        if (wait !== null && wait > RETRY_AFTER_CAP) throw new FetchError(`${label}; asks to wait ${Math.round(wait / 1000)} s`, true)
      } else if (res.status < 500) throw new FetchError(label, false)
      failure = new FetchError(label, true)
    } catch (e) {
      if (e instanceof FetchError) throw e
      failure = new FetchError(e instanceof Error ? e.message : String(e), true)
    }
    if (attempt >= waits.length) throw failure
    await sleep(wait ?? Math.round(waits[attempt]! * (0.5 + random())))
  }
}

/** Waits so that requests to one host are at least `gapMs` apart. */
export function hostPacer(sleep: (ms: number) => Promise<unknown>, now = () => Date.now()) {
  const next = new Map<string, number>()
  return async (url: string, gapMs: number) => {
    const host = new URL(url).host
    const t = now()
    const at = Math.max(t, next.get(host) ?? 0)
    next.set(host, at + gapMs)
    if (at > t) await sleep(at - t)
  }
}

/** Mornings in a row each venue failed; `file` is who just reached STRIKES_TO_FILE. */
export function tallyStrikes(prev: Record<string, number>, read: string[], broken: string[]) {
  const strikes = { ...prev }
  for (const n of read) delete strikes[n]
  for (const n of broken) strikes[n] = (strikes[n] ?? 0) + 1
  return { strikes, file: broken.filter((n) => strikes[n]! >= STRIKES_TO_FILE) }
}
