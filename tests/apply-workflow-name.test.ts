// 2026-10-02 (Don) — the apply workflow's name carries no emoji.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('the production apply workflow', () => {
  it('is named "Apply migrations", with no emoji', () => {
    const name = /^name:\s*(.+)$/m.exec(readFileSync('.github/workflows/apply.yml', 'utf8'))![1]
    expect(name.trim()).toBe('Apply migrations')
  })
})
