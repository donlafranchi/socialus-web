// #945 — Remind me: the dates of a weekly series, which reminder is due when, and what it says.
import { describe, it, expect } from 'vitest'
import { dueSlot, reminderMessage, reminderEmail, seriesOccurrences, type ReminderPrefs } from './reminders'

const pt = (s: string) => new Date(`${s}-07:00`) // Pacific daylight time
const PREFS: ReminderPrefs = { remindEvening: true, remindHour: true, paused: false, quietStart: 21, quietEnd: 8 }
const none = new Set<'evening' | 'hour'>()

describe('a weekly series: every Sunday 8–1, like a farmers market', () => {
  const series = { weekdays: [7], startsOn: null, endsOn: null }
  const first = { startsAt: pt('2026-10-18T08:00:00'), endsAt: pt('2026-10-18T13:00:00') }
  it('lists the Sundays in the window, at the same time of day', () => {
    const occ = seriesOccurrences(series, first, pt('2026-10-19T00:00:00'), pt('2026-11-02T00:00:00'))
    expect(occ.map((o) => o.startsAt.toISOString())).toEqual(['2026-10-25T15:00:00.000Z', '2026-11-01T16:00:00.000Z'])
    expect(occ[0]!.endsAt!.toISOString()).toBe('2026-10-25T20:00:00.000Z')
  })
  it('keeps 8 am on the wall clock across the clocks going back', () => {
    const [nov1] = seriesOccurrences(series, first, pt('2026-10-31T00:00:00'), pt('2026-11-02T00:00:00'))
    expect(nov1!.startsAt.toISOString()).toBe('2026-11-01T16:00:00.000Z') // 8 am PST
  })
  it('stops at the series end and starts no earlier than the first post', () => {
    expect(seriesOccurrences({ ...series, endsOn: '2026-10-25' }, first, pt('2026-10-19T00:00:00'), pt('2026-11-09T00:00:00'))).toHaveLength(1)
    expect(seriesOccurrences(series, first, pt('2026-10-01T00:00:00'), pt('2026-10-19T00:00:00'))).toHaveLength(1)
  })
  it('several weekdays', () => {
    const occ = seriesOccurrences({ weekdays: [3, 7], startsOn: null, endsOn: null }, first, pt('2026-10-19T00:00:00'), pt('2026-10-26T00:00:00'))
    expect(occ.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual(['2026-10-21', '2026-10-25'])
  })
})

describe('which reminder is due', () => {
  const market = pt('2026-10-25T08:00:00')
  it('the evening before at 6 pm', () => {
    expect(dueSlot(market, pt('2026-10-24T17:59:00'), PREFS, none)).toBeNull()
    expect(dueSlot(market, pt('2026-10-24T18:00:00'), PREFS, none)).toBe('evening')
    expect(dueSlot(market, pt('2026-10-24T18:10:00'), PREFS, new Set(['evening']))).toBeNull()
  })
  it('an evening reminder missed by more than 3 hours is not sent late', () => {
    expect(dueSlot(market, pt('2026-10-24T21:30:00'), { ...PREFS, quietStart: 0, quietEnd: 0 }, none)).toBeNull()
  })
  it('1 hour before', () => {
    expect(dueSlot(pt('2026-10-25T10:00:00'), pt('2026-10-25T08:59:00'), PREFS, new Set(['evening']))).toBeNull()
    expect(dueSlot(pt('2026-10-25T10:00:00'), pt('2026-10-25T09:00:00'), PREFS, new Set(['evening']))).toBe('hour')
    expect(dueSlot(pt('2026-10-25T10:00:00'), pt('2026-10-25T10:00:00'), PREFS, none)).toBeNull() // started
  })
  it('quiet hours hold it: a 7:30 am hour-before reminder inside 9 pm–8 am is not sent', () => {
    expect(dueSlot(market, pt('2026-10-25T07:30:00'), PREFS, new Set(['evening']))).toBeNull()
    expect(dueSlot(market, pt('2026-10-25T07:30:00'), { ...PREFS, quietStart: 22, quietEnd: 6 }, new Set(['evening']))).toBe('hour')
  })
  it('pause all stops every reminder', () => {
    expect(dueSlot(market, pt('2026-10-24T18:00:00'), { ...PREFS, paused: true }, none)).toBeNull()
  })
  it('each timing can be turned off', () => {
    expect(dueSlot(market, pt('2026-10-24T18:00:00'), { ...PREFS, remindEvening: false }, none)).toBeNull()
    expect(dueSlot(pt('2026-10-25T10:00:00'), pt('2026-10-25T09:30:00'), { ...PREFS, remindHour: false }, none)).toBeNull()
  })
  it('set late, only the hour-before one goes', () => {
    expect(dueSlot(pt('2026-10-24T19:00:00'), pt('2026-10-24T18:15:00'), PREFS, none)).toBe('hour')
  })
})

describe('what a reminder says', () => {
  const at = pt('2026-10-25T08:00:00')
  it('the evening before', () => {
    const m = reminderMessage('evening', { reminderId: 'r1', pageName: 'Maidu Park Farmers Market', pagePublicId: 'abc123', body: 'Every Sunday, 8 to 1.', occursAt: at })
    expect(m).toMatchObject({ kind: 'reminder', title: 'Maidu Park Farmers Market', body: 'Tomorrow at 8:00 AM · Every Sunday, 8 to 1.', url: '/g/abc123?via=reminder&r=r1' })
  })
  it('an hour before', () => {
    expect(reminderMessage('hour', { reminderId: 'r1', pageName: 'P', pagePublicId: 'abc123', body: 'x', occursAt: at }).body).toBe('In an hour, at 8:00 AM · x')
  })
  it('by email: a subject, the time, a link to the Page and one to stop', () => {
    const e = reminderEmail('evening', { reminderId: 'r1', pageName: 'Maidu Park Farmers Market', pagePublicId: 'abc123', body: 'Every Sunday.', occursAt: at }, 'https://socialus.org')
    expect(e.subject).toBe('Tomorrow at 8:00 AM: Maidu Park Farmers Market')
    expect(e.text).toContain('https://socialus.org/g/abc123?via=reminder&r=r1')
    expect(e.text).toMatch(/stop/i)
  })
})
