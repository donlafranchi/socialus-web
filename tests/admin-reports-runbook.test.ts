import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// #667 — the operator-only reports page carries one plain link to the generated staff safety runbook. A link, not
// a copy: the runbook is regenerated from the rulings, so the page must not restate it.
const page = readFileSync(resolve(__dirname, '../src/app/admin/reports/page.tsx'), 'utf8')

describe('the reports page links the staff safety runbook', () => {
  it('has a "Safety runbook" link to the generated file in socialus-ops, and restates none of it', () => {
    expect(page).toMatch(/href="https:\/\/github\.com\/donlafranchi\/socialus-ops\/blob\/main\/runbooks\/staff-safety\.md"/)
    expect(page).toMatch(/data-testid="safety-runbook-link"/)
    expect(page).toMatch(/>\s*Safety runbook\s*</)
    expect(page).not.toMatch(/report\.cybertip\.org|1-800-THE-LOST/)
  })

  it('sits on the page the permission gate already guards', () => {
    expect(page).toMatch(/requirePagePermission\('reports\.review'\)/)
  })
})
