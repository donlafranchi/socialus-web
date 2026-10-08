// #443 — the triage agent: a cheap model (Haiku) labels and dedupes. What it may
// say is a whitelist; anything else is dropped, so a confused model cannot invent
// an area, a milestone or an Issue number.

import { describe, it, expect, vi } from 'vitest'
import { buildTriagePrompt, parseTriage, triageIssue, TRIAGE_MODEL, TRIAGE_MAX_TOKENS } from './triage'

const open = [
  { number: 211, title: 'bug · Save button does nothing on a Page' },
  { number: 305, title: 'change · Explore map pins' },
]

describe('buildTriagePrompt', () => {
  const p = buildTriagePrompt({ number: 600, title: 'bug · The Save button did nothing', body: 'role: member\n> The Save button did nothing' }, open)
  it('shows the new Issue and the open ones to compare against', () => {
    expect(p).toContain('#600')
    expect(p).toContain('#211')
  })
  it('asks for JSON only, with the allowed areas and milestones named', () => {
    expect(p).toMatch(/JSON/)
    expect(p).toContain('area:page-editing')
    expect(p).toContain('Beta 11-06')
  })
  it('caps what it sends: the open list is trimmed', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ number: i + 1, title: 'x'.repeat(100) }))
    expect(buildTriagePrompt({ number: 1, title: 't', body: 'b' }, many).length).toBeLessThan(20_000)
  })
})

describe('parseTriage', () => {
  it('accepts a clean answer', () => {
    expect(parseTriage('{"area":"page-editing","milestone":"Beta 11-06","duplicateOf":211,"launchBlocking":false}', [211])).toEqual({
      area: 'area:page-editing',
      milestone: 'Beta 11-06',
      duplicateOf: 211,
      launchBlocking: false,
    })
  })
  it('finds the JSON inside prose or a code fence', () => {
    expect(parseTriage('Sure:\n```json\n{"area":"ops"}\n```', [])).toMatchObject({ area: 'area:ops' })
  })
  it('drops an area, milestone or duplicate it was not offered', () => {
    expect(parseTriage('{"area":"payments","milestone":"Someday","duplicateOf":999}', [211])).toEqual({
      area: null,
      milestone: null,
      duplicateOf: null,
      launchBlocking: false,
    })
  })
  it('is null-safe on garbage', () => {
    expect(parseTriage('I could not decide', [])).toEqual({ area: null, milestone: null, duplicateOf: null, launchBlocking: false })
  })
})

describe('triageIssue', () => {
  it('uses the cheap model with a small output cap, and never spends without a key', async () => {
    const call = vi.fn(async () => '{"area":"ops"}')
    expect(TRIAGE_MODEL).toBe('claude-haiku-4-5-20251001')
    expect(TRIAGE_MAX_TOKENS).toBeLessThanOrEqual(400)
    const out = await triageIssue({ number: 1, title: 't', body: 'b' }, open, { call })
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ model: TRIAGE_MODEL, maxTokens: TRIAGE_MAX_TOKENS }))
    expect(out).toMatchObject({ area: 'area:ops' })
  })
  it('without a model call it does nothing', async () => {
    await expect(triageIssue({ number: 1, title: 't', body: 'b' }, open, {})).resolves.toBeNull()
  })
})
