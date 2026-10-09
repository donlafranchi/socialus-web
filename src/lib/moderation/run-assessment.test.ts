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
  rows = { category: 'spam', subject_kind: 'group', name: 'Oak Bakery', content_text: 'Bread.', image_url: 'https://x.test/m/abc/p.webp', reporter_is_builder: false }
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

  // F100 criterion 1 — Posts, post photos and Page pictures are read too, not only a Page's photo.
  it('reads a Post by its words, with no image fetched', async () => {
    rows = { category: 'harassment', subject_kind: 'post', name: 'Oak Bakery', content_text: 'Everyone avoid that woman.', image_url: null, reporter_is_builder: false }
    assess.mockResolvedValue({ reads: [read()], shown: read() })
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    const arg = (assess.mock.calls[0] as unknown as [{ text: string; image: unknown }])[0]
    expect(arg.text).toContain('Everyone avoid that woman.')
    expect(arg.image).toBeNull()
    expect(fetchImage).not.toHaveBeenCalled()
  })

  it('reads a post photo with the post\'s words beside it', async () => {
    rows = { category: 'nudity', subject_kind: 'post_photo', name: 'Oak Bakery', content_text: 'Fresh loaves', image_url: 'https://x.test/m/abc/q.webp', reporter_is_builder: false }
    assess.mockResolvedValue({ reads: [read()], shown: read() })
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    expect(fetchImage).toHaveBeenCalledWith('https://x.test/m/abc/q.webp')
    expect((assess.mock.calls[0] as unknown as [{ text: string }])[0].text).toContain('Fresh loaves')
  })

  it('reads a Page picture', async () => {
    rows = { category: 'spam', subject_kind: 'page_picture', name: 'Oak Bakery', content_text: null, image_url: 'https://x.test/m/abc/pic.webp', reporter_is_builder: false }
    assess.mockResolvedValue({ reads: [read()], shown: read() })
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    expect(fetchImage).toHaveBeenCalledWith('https://x.test/m/abc/pic.webp')
  })

  // [guards F100.1 partial: a poster's rebuttal triggers a read]
  it('a poster\'s rebuttal goes with the content, as their reply', async () => {
    assess.mockResolvedValue({ reads: [read()], shown: read() })
    await runAssessment(REPORT, { query }, { assess, fetchImage, rebuttal: 'Malicious: He reports everything.', restore: vi.fn() })
    expect((assess.mock.calls[0] as unknown as [{ rebuttal: string }])[0].rebuttal).toBe('Malicious: He reports everything.')
  })

  // F102.12 — the restore step: only after a poster's reply, never for severity 1, never allowed to break the read.
  it('after a reply, hands the stored reads to the restore step', async () => {
    const reads = [read({ outcome: 'approve', confidence: 0.97 }), read({ model: 'claude-sonnet-5-5', outcome: 'approve', confidence: 0.96 })]
    assess.mockResolvedValue({ reads, shown: reads[1]! })
    const restore = vi.fn(async () => 'restored' as const)
    await runAssessment(REPORT, { query }, { assess, fetchImage, rebuttal: 'Mistaken: it is my shop.', restore })
    expect(restore).toHaveBeenCalledWith(REPORT, reads)
  })

  it('without a reply there is no restore step', async () => {
    assess.mockResolvedValue({ reads: [read()], shown: read() })
    const restore = vi.fn()
    await runAssessment(REPORT, { query }, { assess, fetchImage, restore })
    expect(restore).not.toHaveBeenCalled()
  })

  it('a severity-1 report is never read and never reaches the restore step', async () => {
    rows.category = 'sensitive_content'
    const restore = vi.fn()
    await runAssessment(REPORT, { query }, { assess, fetchImage, rebuttal: 'Mistaken: x', restore })
    expect(restore).not.toHaveBeenCalled()
  })

  it('a failed restore step does not undo or hide the stored reads', async () => {
    assess.mockResolvedValue({ reads: [read()], shown: read() })
    const restore = vi.fn(async () => {
      throw new Error('db down')
    })
    await expect(runAssessment(REPORT, { query }, { assess, fetchImage, rebuttal: 'Mistaken: x', restore })).resolves.toBeUndefined()
    expect(inserts()).toHaveLength(1)
  })

  it('asks for Sonnet on a confident approving severity-4 read once the poster has replied, and not before', async () => {
    assess.mockResolvedValue({ reads: [read()], shown: read() })
    const confident = read({ outcome: 'approve', confidence: 0.97 })
    await runAssessment(REPORT, { query }, { assess, fetchImage, rebuttal: 'Mistaken: x', restore: vi.fn() })
    const withReply = (assess.mock.calls[0] as unknown as [{ secondOpinionIf: (r: Read) => boolean }])[0].secondOpinionIf
    expect(withReply(confident)).toBe(true)
    expect(withReply(read({ outcome: 'remove', confidence: 0.97 }))).toBe(false)
    await runAssessment(REPORT, { query }, { assess, fetchImage, restore: vi.fn() })
    const noReply = (assess.mock.calls[1] as unknown as [{ secondOpinionIf: (r: Read) => boolean }])[0].secondOpinionIf
    expect(noReply(confident)).toBe(false)
  })

  it('a deleted subject is skipped quietly', async () => {
    rows = undefined as never
    query.mockImplementation(async () => ({ rows: [] }))
    await runAssessment(REPORT, { query }, { assess, fetchImage })
    expect(assess).not.toHaveBeenCalled()
  })
})
