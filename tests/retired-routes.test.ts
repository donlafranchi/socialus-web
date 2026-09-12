// T149 (Issue #30) — retiring a surface in the docs is not retiring it.
//
// The sweep that deletes the vendor-era routes is gated: the PM ruled that
// nothing is deleted until T125 (#15) and T126 (#16) have merged, because the
// recruitment grid, the vendor profile and the producer dashboard are those
// tickets' reference material. The one carve-out is `/following` — a live,
// routable duplicate of the shipped `/you/following`, which gets its redirect
// now because a redirect deletes nothing.
//
// So this file guards two things that outlive the sweep:
//   1. `/following` answers with a redirect rather than a second, broken copy.
//   2. No redirect in next.config points at a route that does not exist — the
//      check that fires the day the delete phases run without the config
//      catching up, which is the failure mode that left three "retired" routes
//      serving pages.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const APP = path.join(ROOT, 'src/app')

interface Redirect {
  source: string
  destination: string
}

const config = readFileSync(path.join(ROOT, 'next.config.ts'), 'utf8')

const REDIRECTS: Redirect[] = [
  ...config.matchAll(/source:\s*'([^']+)',\s*destination:\s*'([^']+)'/g),
].map((m) => ({ source: m[1], destination: m[2] }))

/** Route patterns the app serves, walked from the App Router tree on disk. */
function routePatterns(dir = APP, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // A parenthesised directory is a route group: real on disk, absent from
      // the URL.
      const segment = /^\(.+\)$/.test(entry.name) ? prefix : `${prefix}/${entry.name}`
      found.push(...routePatterns(path.join(dir, entry.name), segment))
    } else if (entry.name === 'page.tsx') {
      found.push(prefix || '/')
    }
  }
  return found
}

const PATTERNS = routePatterns()

/** Does `urlPath` land on one of the app's route patterns? */
function resolves(urlPath: string): boolean {
  const segments = urlPath.split('?')[0].split('/').filter(Boolean)
  return PATTERNS.some((pattern) => {
    const parts = pattern.split('/').filter(Boolean)
    let i = 0
    for (const part of parts) {
      // `[...slug]` swallows the rest, but requires at least one segment.
      if (part.startsWith('[...')) return segments.length > i
      if (i >= segments.length) return false
      if (!/^\[.+\]$/.test(part) && part !== segments[i]) return false
      i++
    }
    return i === segments.length
  })
}

describe('T149 — retired routes', () => {
  it('reads every redirect in next.config', () => {
    // The parser below only matches `source` immediately followed by
    // `destination`, both single-quoted. A redirect written any other way
    // would be skipped silently — and a skipped redirect makes the
    // dangling-destination check below pass without checking anything.
    expect(REDIRECTS.length).toBe([...config.matchAll(/\bsource:/g)].length)
  })

  it('/following redirects to the shipped /you/following', () => {
    const following = REDIRECTS.find((r) => r.source === '/following')
    expect(following?.destination).toBe('/you/following')
  })

  it('every redirect destination resolves to a route the app serves', () => {
    const dangling = REDIRECTS.filter((r) => r.destination.startsWith('/'))
      .filter((r) => !resolves(r.destination))
      .map((r) => `${r.source} → ${r.destination}`)
    expect(dangling).toEqual([])
  })
})
