// F100 — runs after a report commits and never blocks it. Shadow mode: the only
// thing written is report_assessments; nothing hides, restores, notifies or
// reorders because of it (criterion 6).

import { categoryLabel, type ReportCategory } from '@/lib/reports/categories'
import { assessContent, type AssessInput, type Assessment } from './assess'

interface Db {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

interface Deps {
  assess?: (input: AssessInput) => Promise<Assessment | null>
  fetchImage?: (url: string) => Promise<AssessInput['image']>
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function fetchImageBytes(url: string): Promise<AssessInput['image']> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    const type = res.headers.get('content-type')?.split(';')[0] ?? ''
    if (!res.ok || !IMAGE_TYPES.includes(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_IMAGE_BYTES) return null
    return { mediaType: type, base64: buf.toString('base64') }
  } catch {
    return null
  }
}

const insertSkipped = (db: Db, reportId: string, why: string) =>
  db.query(`insert into public.report_assessments (report_id, skipped_reason) values ($1, $2)`, [reportId, why])

export async function runAssessment(reportId: string, db: Db, deps: Deps = {}): Promise<void> {
  const { assess = (i) => assessContent(i), fetchImage = fetchImageBytes } = deps
  const res = await db.query(
    `select r.category, g.name, g.description, g.photo_url,
            public.is_builder(r.reporter_member_id) as reporter_is_builder
       from public.reports r
       join public.groups g on g.id = r.subject_id
      where r.id = $1`,
    [reportId],
  )
  const row = res.rows[0] as
    | { category: ReportCategory | null; name: string; description: string; photo_url: string | null; reporter_is_builder: boolean }
    | undefined
  if (!row) return

  if (row.reporter_is_builder) return void (await insertSkipped(db, reportId, 'a builder report: not read'))
  // Criterion 12: suspected severity 1 never goes to a provider. The reporter's
  // sensitive-content reason is the only signal that exists today.
  if (row.category === 'sensitive_content') {
    return void (await insertSkipped(db, reportId, 'suspected severity 1: not sent to an AI provider (F100 criterion 12)'))
  }

  const image = row.photo_url ? await fetchImage(row.photo_url) : null
  const result = await assess({
    text: [row.name, row.description].filter(Boolean).join('\n'),
    image,
    reporterReason: row.category ? categoryLabel(row.category) : 'No reason given',
    rebuttal: null,
  })
  if (!result) return void (await insertSkipped(db, reportId, 'no assessment: the call failed or answered badly'))

  for (const r of result.reads) {
    await db.query(
      `insert into public.report_assessments
         (report_id, model, prompt_version, category, severity, confidence, outcome, reason, latency_ms, input_tokens, output_tokens)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [reportId, r.model, r.promptVersion, r.category, r.severity, r.confidence, r.outcome, r.reason, r.latencyMs, r.inputTokens, r.outputTokens],
    )
  }
}
