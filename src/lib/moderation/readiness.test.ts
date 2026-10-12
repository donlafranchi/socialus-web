// #640 (F100.11, the PM's call C, 2026-10-11) — for beta the live flip is Don's own checklist, with the
// numbers shown to him: each against its target, green / amber / red, and one "ready to go live" light.
// Before production the software refuses the flip (a later step); this is the numbers.

import { describe, it, expect } from 'vitest'
import { readiness, SHADOW_DAYS_TARGET, type EvalRun } from './readiness'

const RUN: EvalRun = { runAt: new Date('2026-10-10T12:00:00Z'), cases: 60, recall: 0.97, sev1Cases: 5, sev1Recall: 1, falseAlarmRate: 0.04 }
const NOW = new Date('2026-10-12T12:00:00Z')

describe('readiness', () => {
  // [guards F100.11 partial: the three targets and the two weeks, each with its colour and the light]
  it('is ready when every number meets its target and there are two weeks of shadow reads', () => {
    const r = readiness({ run: RUN, shadowDays: 14, now: NOW })
    expect(r.recall).toMatchObject({ status: 'green', value: 0.97, target: 0.95 })
    expect(r.sev1Recall).toMatchObject({ status: 'green', value: 1, target: 1 })
    expect(r.falseAlarms).toMatchObject({ status: 'green', value: 0.04, target: 0.1 })
    expect(r.shadow).toMatchObject({ status: 'green', days: 14, of: 14 })
    expect(r.ready).toBe(true)
  })

  it('targets are the ruled ones: recall at least 95%, severity-1 exactly 100%, false alarms under 10%, 14 days', () => {
    expect(SHADOW_DAYS_TARGET).toBe(14)
    expect(readiness({ run: { ...RUN, recall: 0.95 }, shadowDays: 14, now: NOW }).recall.status).toBe('green')
    expect(readiness({ run: { ...RUN, recall: 0.949 }, shadowDays: 14, now: NOW }).recall.status).not.toBe('green')
    expect(readiness({ run: { ...RUN, sev1Recall: 0.99 }, shadowDays: 14, now: NOW }).sev1Recall.status).not.toBe('green')
    expect(readiness({ run: { ...RUN, falseAlarmRate: 0.1 }, shadowDays: 14, now: NOW }).falseAlarms.status).not.toBe('green')
    expect(readiness({ run: { ...RUN, falseAlarmRate: 0.099 }, shadowDays: 14, now: NOW }).falseAlarms.status).toBe('green')
  })

  it('amber is near the line, red is clearly short', () => {
    const r = readiness({ run: { ...RUN, recall: 0.92, falseAlarmRate: 0.12, sev1Recall: 0.9 }, shadowDays: 9, now: NOW })
    expect(r.recall.status).toBe('amber')
    expect(r.falseAlarms.status).toBe('amber')
    expect(r.sev1Recall.status).toBe('amber')
    expect(r.shadow.status).toBe('amber')
    const bad = readiness({ run: { ...RUN, recall: 0.7, falseAlarmRate: 0.4, sev1Recall: 0.5 }, shadowDays: 2, now: NOW })
    expect([bad.recall.status, bad.falseAlarms.status, bad.sev1Recall.status, bad.shadow.status]).toEqual(['red', 'red', 'red', 'red'])
  })

  it('one number short and it is not ready', () => {
    expect(readiness({ run: RUN, shadowDays: 13, now: NOW }).ready).toBe(false)
    expect(readiness({ run: { ...RUN, recall: 0.9 }, shadowDays: 14, now: NOW }).ready).toBe(false)
  })

  it('a set with no severity-1 cases is not a pass: the target is met vacuously, so it shows amber and says why', () => {
    const r = readiness({ run: { ...RUN, sev1Cases: 0, sev1Recall: 0 }, shadowDays: 14, now: NOW })
    expect(r.sev1Recall.status).toBe('amber')
    expect(r.sev1Recall.note).toMatch(/no severity-1 cases/i)
    expect(r.ready).toBe(false)
  })

  it('no harness run yet is red on all three, with no date, and not ready', () => {
    const r = readiness({ run: null, shadowDays: 14, now: NOW })
    expect([r.recall.status, r.sev1Recall.status, r.falseAlarms.status]).toEqual(['red', 'red', 'red'])
    expect(r.recall.runAt).toBeNull()
    expect(r.ready).toBe(false)
  })

  it('carries the date of the last harness run and how many days ago it was', () => {
    const r = readiness({ run: RUN, shadowDays: 14, now: NOW })
    expect(r.recall.runAt).toEqual(RUN.runAt)
    expect(r.recall.daysAgo).toBe(2)
  })

  it('no shadow reads yet is zero days and red', () => {
    expect(readiness({ run: RUN, shadowDays: 0, now: NOW }).shadow).toMatchObject({ days: 0, status: 'red' })
  })

  it('caps the shadow days at the target so the panel reads 14 of 14, not 40 of 14', () => {
    expect(readiness({ run: RUN, shadowDays: 40, now: NOW }).shadow.days).toBe(14)
  })
})
