import { describe, expect, it } from 'vitest'
import { expectedGapDays, flagsFor, parseWorkflow, tasksFromRaw } from './infra-inventory'

const now = new Date('2026-11-26T12:00:00Z')

describe('infra inventory', () => {
  it('reads a job’s name, purpose, ticket and triggers from its file', () => {
    const j = parseWorkflow(
      'x.yml',
      "name: Page purge (daily)\n\n# #423 — a Page its owner deleted is restorable for 14 days. Then gone.\non:\n  schedule:\n    - cron: '23 11 * * *'\n  workflow_dispatch:\njobs: {}\n",
    )
    expect(j).toMatchObject({ name: 'Page purge (daily)', cites: '#423', crons: ['23 11 * * *'], triggers: ['by-hand', 'timer'] })
    expect(j.purpose).toBe('A Page its owner deleted is restorable for 14 days.')
  })

  it('expects a monthly job monthly, a weekly one weekly and the rest daily', () => {
    expect(expectedGapDays(['43 11 3 * *'])).toBe(35)
    expect(expectedGapDays(['41 16 * * 1'])).toBe(8)
    expect(expectedGapDays(['*/15 * * * *', '20 15 * * 1'])).toBe(2)
  })

  it('flags a timer gone quiet, a failed run, a never-run job and an idle by-hand tool', () => {
    const base = { file: 'a.yml', name: 'a', purpose: '', cites: null }
    expect(flagsFor({ ...base, triggers: ['timer'], crons: ['0 3 * * *'], runs: 9, lastRun: '2026-11-20T00:00:00Z', result: 'success' }, now)).toEqual(['timer silent 2+ days'])
    expect(flagsFor({ ...base, triggers: ['timer'], crons: ['43 11 3 * *'], runs: 1, lastRun: '2026-11-12T00:00:00Z', result: 'success' }, now)).toEqual([])
    expect(flagsFor({ ...base, triggers: ['by-hand'], crons: [], runs: 0, lastRun: null, result: null }, now)).toEqual(['never run'])
    expect(flagsFor({ ...base, triggers: ['by-hand'], crons: [], runs: 1, lastRun: '2026-10-01T00:00:00Z', result: 'failure' }, now)).toEqual(['last run failed', 'unused 30+ days'])
  })

  it('keeps a scheduled task’s schedule and state but not its prompt', () => {
    const [t] = tasksFromRaw({
      data: [{ name: 'Nightly', cron_expression: '0 21 * * *', enabled: false, created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-27T00:00:00Z', last_fired_at: '2026-10-26T04:00:00Z', derived_state: { prompt: 'Merges green PRs. Secret detail follows.' } }],
    })
    expect(t).toEqual({ name: 'Nightly', schedule: '0 21 * * *', on: false, oneShot: false, lastRun: '2026-10-26T04:00:00Z', created: '2026-10-07', changed: '2026-10-27', purpose: 'Merges green PRs.' })
  })
})
