// #1435 — every live practice names the seat a person takes later; the import fails a practice with none.
import { describe, it, expect } from 'vitest'
import { SEATS, seatProblems, readSeats, SEATS_PATH } from '../scripts/knowledge/seats'
import { howLineText, type HowLine } from '@/lib/knowledge/lookups'
import { renderPack, type PackPractice } from '@/lib/knowledge/pack'

describe('practice seats', () => {
  it('names the seven seats from the method review', () => {
    expect([...SEATS]).toEqual(['product manager', 'tech lead', 'engineer', 'reviewer', 'on-call', 'release owner', 'support'])
  })

  it('fails a live practice with no seat, or a seat that is not one of the seven', () => {
    const p = seatProblems(['practice.a', 'practice.b', 'practice.c'], { 'practice.a': 'tech lead', 'practice.c': 'janitor' })
    expect(p).toEqual(['practice.b has no seat in scripts/knowledge/seats.json', 'practice.c names "janitor", not a seat'])
    expect(seatProblems(['practice.a'], { 'practice.a': 'reviewer', 'practice.gone': 'support' })).toEqual([])
  })

  it('the seats file names only real seats', () => {
    const seats = readSeats(SEATS_PATH)
    expect(Object.keys(seats).length).toBeGreaterThanOrEqual(98)
    for (const s of Object.values(seats)) expect(SEATS).toContain(s)
  })

  it('how and the pack show the seat', () => {
    const line: HowLine = { concern: 'how-planning', area: 'How we plan', id: 'practice.architecture-note-first', answer: 'A note first.', why: null, strength: 'rule', ring: 'adopt', holds: null, enforced_by: null, applies: [], seat: 'tech lead' }
    expect(howLineText(line)).toBe('- practice.architecture-note-first · rule, adopt: A note first. Seat: tech lead. Enforced by: nothing yet.')
    const p: PackPractice = { id: 'practice.x', concern: 'how-planning', area: 'How we plan', answer: 'A note first.', why: 'Because.', strength: 'rule', ring: 'adopt', holds: null, seat: 'tech lead' }
    expect(renderPack([p], [], '2026-11-26').text).toContain('Seat: tech lead.')
  })
})
