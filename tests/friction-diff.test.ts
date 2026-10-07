// chore #433 — a night's builder journeys are compared with the last night's:
// friction that is new is a finding, friction that was already there is not,
// and a day's different organization names or timings are not "new".

import { describe, it, expect } from 'vitest'
import { frictionKeys, newFriction } from '../scripts/builders/friction-diff'

const log = (...lines: string[]) => ['# Friction log', '', ...lines, ''].join('\n')

describe('frictionKeys', () => {
  it('ignores the organization, timings and screenshot links', () => {
    const a = log('- **business · Maya Bakes · Create — slow: took 12s** ([shot](s/1.png))'.replace('slow: took 12s**', 'slow: took 12s'))
    expect(frictionKeys(log('- **business · Maya Bakes · Create** — slow: took 12s ([shot](a.png))'))).toEqual(
      frictionKeys(log('- **business · Other Co · Create** — slow: took 31s ([shot](b.png))')),
    )
    expect(a).toContain('Maya Bakes')
  })
  it('reads "Nothing got stuck" as no friction', () => {
    expect(frictionKeys('# Friction log\n\nNothing got stuck.\n')).toEqual([])
  })
})

describe('newFriction', () => {
  const base = log('- **business · A · Publish** — stuck: no button', '- **interest · B · RSVP** — missing: no way to say you are going')
  it('is empty when nothing new appeared', () => {
    expect(newFriction(base, base)).toEqual([])
  })
  it('names friction the baseline did not have', () => {
    const now = log('- **business · A · Publish** — stuck: no button', '- **practice · C · Photo** — stuck: upload failed')
    expect(newFriction(base, now)).toEqual(['practice · Photo — stuck: upload failed'])
  })
  it('treats a first run with no baseline as nothing to compare', () => {
    expect(newFriction(null, base)).toEqual([])
  })
  it('counts a repeat of a known line once, not as new', () => {
    const now = log('- **business · A · Publish** — stuck: no button', '- **business · Z · Publish** — stuck: no button')
    expect(newFriction(base, now)).toEqual([])
  })
})
