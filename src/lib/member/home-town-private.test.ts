// #695 (F103.5) — the home town is never shown to another member. Members are readable by their owner only
// (members_select_self), and the code that touches the column is a short, named list: the two handlers that write it.
// Anything else naming it (a page, a component, a view, a query for another member) fails here and has to be argued for.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const ALLOWED = new Set([
  'src/actions/member/signup-profile-set.ts',
  'src/actions/member/zip-set.ts',
])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : sources(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

describe('F103.5 — the home town stays private', () => {
  // [guards F103.5 partial: no code outside the two writing handlers names the home town]
  it('is named only by the handlers that write it', () => {
    const naming = sources(join(ROOT, 'src'))
      .filter((p) => /home_town|homeTown/.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(ROOT.length + 1))
      .filter((p) => !ALLOWED.has(p))
    expect(naming).toEqual([])
  })

  it('the guard sees a page that reads it', () => {
    expect(/home_town|homeTown/.test("supabase.from('members').select('home_town')")).toBe(true)
  })
})
