// Bug #189 — issue-lint could not parse the template it enforces.
//
// The check was `/Kind:\s*(scenario|change|bug|chore)/i`. The template emits
// `**Kind:** scenario | change | bug | chore`. After `Kind:` comes `**`, which
// `\s*` cannot cross, so every issue opened from this repo's own template was
// judged to be missing the two fields it had just filled in.
//
// A test asserting a regex literal copied into this file would have passed
// while the workflow stayed broken — the bug was the two files disagreeing,
// not either one alone. So this reads BOTH off disk: the patterns out of the
// workflow, the field lines out of the template, and runs one against the
// other. It is the disagreement that is under test.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const WORKFLOW = readFileSync(resolve(ROOT, '.github/workflows/issue-lint.yml'), 'utf8')
const TEMPLATE = readFileSync(resolve(ROOT, '.github/ISSUE_TEMPLATE/work.md'), 'utf8')

/** Pull a regex literal out of the workflow by the const it is assigned to. */
function patternFor(name: string): RegExp {
  const m = WORKFLOW.match(new RegExp(`const ${name}\\s*=\\s*body\\.match\\((/.+/)([a-z]*)\\);`))
  if (!m) throw new Error(`could not find ${name} in issue-lint.yml — did the script get rewritten?`)
  return new RegExp(m[1].slice(1, -1), m[2])
}

describe('issue-lint against the template it enforces', () => {
  // The template's own line is a MENU, not an answer: `**Scenario:** F### | none`
  // has literal hashes and is supposed to fail, because an untouched template
  // is exactly what the lint exists to catch. So what is under test is the
  // FORMATTING the template imposes — the bold markers around the field name —
  // with a real answer filled in where a person would put one.
  function filled(field: string, answer: string): string {
    const line = TEMPLATE.split('\n').find((l) => l.includes(`${field}:`))
    expect(line, `the template no longer has a ${field}: line`).toBeTruthy()
    const prefix = line!.slice(0, line!.indexOf(`${field}:`) + field.length + 1)
    return `${prefix}${line!.slice(prefix.length).match(/^\**/)?.[0] ?? ''} ${answer}`
  }

  it('finds Kind once a person has filled the template in', () => {
    for (const answer of ['scenario', 'change', 'bug', 'chore']) {
      const line = filled('Kind', answer)
      expect(patternFor('kindMatch').test(line), `did not match: ${line}`).toBe(true)
    }
  })

  it('finds Scenario once a person has filled the template in', () => {
    for (const answer of ['F072', 'none']) {
      const line = filled('Scenario', answer)
      expect(patternFor('scenarioMatch').test(line), `did not match: ${line}`).toBe(true)
    }
  })

  it('still flags a template nobody filled in', () => {
    const scenarioLine = TEMPLATE.split('\n').find((l) => l.includes('Scenario:'))!
    expect(
      patternFor('scenarioMatch').test(scenarioLine),
      'the untouched placeholder passes lint, so an unfilled issue would too',
    ).toBe(false)
  })

  it('reads the kind a person actually chose, not the first word of the menu', () => {
    const kind = patternFor('kindMatch')
    expect('**Kind:** bug'.match(kind)?.[1]).toBe('bug')
    expect('**Kind:** chore'.match(kind)?.[1]).toBe('chore')
    expect('Kind: scenario'.match(kind)?.[1]).toBe('scenario')
  })

  it('still rejects a body that names no kind at all', () => {
    expect(patternFor('kindMatch').test('no fields here, just prose')).toBe(false)
    expect(patternFor('scenarioMatch').test('no fields here, just prose')).toBe(false)
  })

  it('can actually write the label it decides to apply', () => {
    // The other half of #189: the job had no permissions block, so addLabels
    // returned 403 and the run died before commenting. A parse fix alone would
    // have left the control just as dead.
    expect(WORKFLOW).toMatch(/^permissions:$/m)
    expect(WORKFLOW).toMatch(/^\s+issues:\s*write$/m)
  })
})
