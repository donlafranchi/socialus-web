import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { QUARANTINE } from '../evals/quarantine'

// #269 — a quarantined eval is excluded from CI by its exact title. An entry
// whose title no longer exists would quietly exclude nothing, so it fails here.
describe('the eval quarantine names real tests', () => {
  it.each(QUARANTINE.map((q) => [q.file, q.title] as const))('%s: %s', (file, title) => {
    const path = resolve(__dirname, '..', 'evals', file)
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf8').replace(/\\"/g, '"').replace(/\\'/g, "'")
    expect(src.includes(title.slice(0, 50))).toBe(true)
  })
})
