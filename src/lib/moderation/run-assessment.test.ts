import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAssessment } from './run-assessment'
import type { Assessment, Read } from './assess'

// F100 — after a report is stored: skip what must never reach a provider, read
// the rest, store every read. Shadow: this writes only report_assessments.

const REPORT = '11111111-1111-1111-1111-111111111111'

const read = (over: Partial<Read> = {}): Read => ({
  model: 'claude-haiku-4-5-20251001',
  promptVersion: 'v',
  category: 'spam',
  severity: 4,
  confidence: 0.9,
  outcome: 'remove',
  reason: 'Promotion.',
  latencyMs: 300,
  inputTokens: 100,
  outputTokens: 20,
  ...over,
})

let rows: Record<string, unknown>
const query = vi.fn()
const assess = vi.fn<() => Promise<Assessment | null>>()
const fetchImage = vi.fn()

beforeEach(() => {
  query.mockReset()
  assess.mockReset()
  fetchImage.mockReset()
  rows = { category: 'spam', body: 'Reported.', name: 'Oak Bakery', description: 'Bread.', photo_url: 'https://x.test/m/abc/p.webp', reporter_is_builder: false }
  query.mockImplementation(async (sql: string) => (/from public\.reports/i.test(sql) ? { rows: [rows] } : { rows: [] }))
  fetchImage.mockResolvedValue({ mediaType: 'image/webp', base64: 'AAAA' })
})

const inserts = () => (query.mock.calls as [string, unknown[]][]).filter(([s]) => /insert into public\.report_assessments/i.test(s))

describe('F100 — runAssessment', () => {
  it('stores every read it made', async () => {
    const a = read()
    const b = read({ model: 'claude-sonnet-5-5', confidence: 0.8 })
    assess.mockResolvedValue({ reads: [a, b], shown: b })
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    expect(inserts()).toHaveLength(2)
    expect(inserts()[1]![1]).toEqual(expect.arrayContaining([REPORT, 'claude-sonnet-5-5']))
  })

  // [guards F100.12]
  it('a sensitive-content report is never sent to a provider: one skipped row, no call, no image fetch', async () => {
    rows.category = 'sensitive_content'
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    expect(assess).not.toHaveBeenCalled()
    expect(fetchImage).not.toHaveBeenCalled()
    expect(inserts()).toHaveLength(1)
    expect(JSON.stringify(inserts()[0]![1])).toMatch(/severity 1/)
  })

  it('sends the Page\'s words and the photo as bytes, with the reporter\'s reason label and no identity', async () => {
    assess.mockResolvedValue({ reads: [read()], shown: read() })
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    const arg = (assess.mock.calls[0] as unknown as [{ text: string; image: unknown; reporterReason: string }])[0]
    expect(arg.text).toContain('Oak Bakery')
    expect(arg.image).toEqual({ mediaType: 'image/webp', base64: 'AAAA' })
    expect(arg.reporterReason).toBe('Spam')
    expect(JSON.stringify(arg)).not.toContain('abc')
  })

  it('a builder\'s report is recorded as skipped and costs nothing', async () => {
    rows.reporter_is_builder = true
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    expect(assess).not.toHaveBeenCalled()
    expect(inserts()).toHaveLength(1)
  })

  it('a failed call is recorded, so the operator can see it was tried', async () => {
    assess.mockResolvedValue(null)
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    expect(inserts()).toHaveLength(1)
    expect(JSON.stringify(inserts()[0]![1])).toMatch(/no assessment/)
  })

  it('a photo that cannot be fetched is read as text alone', async () => {
    fetchImage.mockResolvedValue(null)
    assess.mockResolvedValue({ reads: [read()], shown: read() })
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    expect((assess.mock.calls[0] as unknown as [{ image: unknown }])[0].image).toBeNull()
  })

  // [guards F100.6]
  it('shadow: writes only report_assessments', async () => {
    assess.mockResolvedValue({ reads: [read()], shown: read() })
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    const writes = (query.mock.calls as [string][]).map(([s]) => s).filter((s) => /^\s*(insert|update|delete)/i.test(s))
    expect(writes.every((s) => /report_assessments/i.test(s))).toBe(true)
  })
})
