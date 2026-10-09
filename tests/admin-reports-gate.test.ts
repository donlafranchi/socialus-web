// The surface does not announce itself. A non-operator gets 404, not 403 —
// a 403 tells a stranger there is something here worth finding (#12).
//
// This asserts the gate at the only place it can be asserted without a browser:
// the page calls notFound() unless isOperator() passes, and isOperator fails
// closed. The route-level behaviour is verified by hand (404 with the variable
// unset, signed out) and recorded in the build log.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const raw = readFileSync(resolve(__dirname, '..', 'src/app/admin/reports/page.tsx'), 'utf8')
// Comments explain the 404-not-403 choice, so match against code only —
// otherwise the assertion fails on the sentence justifying it.
const page = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the operator surface is gated', () => {
  it('answers 404 rather than rendering a 403 (the guard calls notFound)', () => {
    expect(page).not.toMatch(/\b403\b/)
    expect(readFileSync(resolve(__dirname, '..', 'src/lib/staff/page-guard.ts'), 'utf8')).toContain('notFound()')
  })

  it('gates on the reports.review permission, not on a UI condition (#544)', () => {
    expect(page).toMatch(/requirePagePermission\('reports\.review'\)/)
  })

  it('is never prerendered — a stale queue means reviewing a decided report', () => {
    expect(page).toContain("export const dynamic = 'force-dynamic'")
  })

  // reports has no client SELECT policy and must not gain one.
  it('reads the queue server-side, not through the browser client', () => {
    expect(page).toContain('fetchReviewQueue')
    expect(page).not.toContain('@/lib/supabase"')
  })
})
