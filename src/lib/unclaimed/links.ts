// #556 — is this link alive? Used by the loader before it writes a Page and after (a Page's own
// address in the app). A site that answers 401/403/429 to a robot is alive (a person gets in);
// a 404/410, a server error that stays, a bad certificate or no answer is broken.
import type { Fetch } from './photos'

export interface LinkVerdict {
  url: string
  ok: boolean
  status: number | null
  note: string
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 SocialUsLinkCheck/1.0'
const BLOCKS_ROBOTS = new Set([401, 403, 405, 406, 429, 451, 999])
/** Hosts that put a login or bot wall in front of every address, so only their own error pages say anything. */
const WALLED = /(^|\.)(instagram|facebook|tiktok|x|twitter|unsplash)\.com$/i

export async function checkLink(url: string, f: Fetch = fetch): Promise<LinkVerdict> {
  let host = ''
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { url, ok: false, status: null, note: 'not an http(s) link' }
    host = u.hostname
  } catch {
    return { url, ok: false, status: null, note: 'not a URL' }
  }
  let last: LinkVerdict = { url, ok: false, status: null, note: 'no answer' }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await f(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.5' }, signal: AbortSignal.timeout(25_000) })
      void r.body?.cancel().catch(() => {})
      if (r.status < 400) return { url, ok: true, status: r.status, note: 'ok' }
      if (BLOCKS_ROBOTS.has(r.status) || (WALLED.test(host) && r.status < 500)) return { url, ok: true, status: r.status, note: `answers robots with ${r.status}` }
      last = { url, ok: false, status: r.status, note: `answers ${r.status}` }
      if (r.status < 500) break
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause?.code
      last = { url, ok: false, status: null, note: cause ?? (e instanceof Error ? e.message : 'no answer') }
    }
    await new Promise((res) => setTimeout(res, 1500))
  }
  return last
}

export async function checkLinks(urls: string[], f: Fetch = fetch, concurrency = 6): Promise<LinkVerdict[]> {
  const uniq = [...new Set(urls)]
  const out = new Map<string, LinkVerdict>()
  let i = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < uniq.length) {
        const u = uniq[i++]!
        out.set(u, await checkLink(u, f))
      }
    }),
  )
  return urls.map((u) => out.get(u)!)
}
