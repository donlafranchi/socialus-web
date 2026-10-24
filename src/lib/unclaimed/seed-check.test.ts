import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkSeed, checkSeedPrBody } from './seed-check'

const ledger = (asOf: string, rows: string[]) => `# x\n\n**As of ${asOf}** · y\n\n| Date | Name |\n|---|---|\n${rows.join('\n')}\n`
const row = (d: string, n: string) => `| ${d} | ${n} | Farm | Town | A | |`
const base = { date: '2026-10-23', rows: [{ name: 'A Farm', confidence: 'stock photos only' }], overrides: { stockOnly: ['A Farm'] } }

describe('checkSeed (#1027)', () => {
  it('passes a complete seed', () => {
    expect(checkSeed({ ...base, ledger: ledger('2026-10-23', [row('2026-10-22', 'Old'), row('2026-10-23', 'A Farm')]) })).toEqual([])
  })
  it('fails the way #1002 did: no ledger rows, stale as-of', () => {
    const p = checkSeed({ ...base, ledger: ledger('2026-10-22', [row('2026-10-22', 'Old')]) })
    expect(p).toEqual(['ADDED.md has no 2026-10-23 row for "A Farm"', 'ADDED.md "As of" is 2026-10-22, expected 2026-10-23 or later'])
  })
  it('fails a stock-photo Page missing from stockOnly, duplicates, extra rows and misordered rows', () => {
    const p = checkSeed({ ...base, overrides: { stockOnly: ['X', 'X'] }, ledger: ledger('2026-10-23', [row('2026-10-23', 'A Farm'), row('2026-10-23', 'Ghost'), row('2026-10-22', 'Old')]) })
    expect(p.join('\n')).toMatch(/Ghost/)
    expect(p.join('\n')).toMatch(/older rows after/)
    expect(p.join('\n')).toMatch(/twice: X/)
    expect(p.join('\n')).toMatch(/"A Farm" says stock photos/)
  })
  it('checks the PR body like issue-lint', () => {
    expect(checkSeedPrBody('Closes #1001\n\nseven pages')).toHaveLength(3)
    expect(checkSeedPrBody('**Kind:** change\n**Scenario:** none\n**Path:** well-worn: x\n\nCloses #1')).toEqual([])
  })
  // Runs in CI on every PR, so a generator PR that skips the ledger or the stock list goes red.
  it('every makers file from 2026-10-23 on is in the ledger and the overrides', () => {
    const dir = join(__dirname, '../../../scripts/unclaimed')
    const led = readFileSync(join(dir, 'ADDED.md'), 'utf8')
    const overrides = JSON.parse(readFileSync(join(dir, 'photo-overrides.json'), 'utf8'))
    for (const f of readdirSync(dir).filter((f) => /^makers-2026-10-(2[3-9]|3\d).*\.json$/.test(f))) {
      const date = f.slice(7, 17)
      expect(checkSeed({ date, rows: JSON.parse(readFileSync(join(dir, f), 'utf8')), ledger: led, overrides }), f).toEqual([])
    }
  })
})
