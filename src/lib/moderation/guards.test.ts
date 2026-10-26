// #643 (F100 criteria 4, 6, 12) — standing guards over the provider call. Each invariant had a test on one path;
// these watch the others, so a new caller or a new field fails here and has to be argued for.

import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { assessContent } from './assess'
import { runAssessment } from './run-assessment'
import { groupBySubject, orderSubjects } from '@/lib/admin/review-subjects'
import type { QueuedReport } from '@/lib/admin/reports-queue'

const ROOT = resolve(__dirname, '../../..')
const rel = (p: string) => p.slice(ROOT.length + 1)

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : sources(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}
const SRC = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'scripts'))]
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** The member-identifying names a request to a provider must never carry a field for. */
const MEMBER_FIELD = /member|handle|email|user|display|legal|phone|zip/i

/** The properties declared in `export interface <name> { ... }`. */
export function interfaceKeys(source: string, name: string): string[] {
  const block = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(source)?.[1] ?? ''
  return [...block.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]!)
}

describe('F100.4 — what is sent is the content, the reporter\'s reason and the rebuttal only', () => {
  // [guards F100.4]
  it('AssessInput has no field that could carry a member\'s name, handle or email', () => {
    const keys = interfaceKeys(read('src/lib/moderation/assess.ts'), 'AssessInput')
    expect(keys.sort()).toEqual(['image', 'rebuttal', 'reporterReason', 'secondOpinionIf', 'text'])
    expect(keys.filter((k) => MEMBER_FIELD.test(k))).toEqual([])
  })

  it('the guard sees a field that would carry a member', () => {
    const bad = 'export interface AssessInput {\n  text: string\n  reporterEmail: string\n}'
    expect(interfaceKeys(bad, 'AssessInput').filter((k) => MEMBER_FIELD.test(k))).toEqual(['reporterEmail'])
  })

  it('a member seeded with a distinctive name, handle and email never reaches the request body', async () => {
    const seeded = { display_name: 'Zebulon Quixote', handle: 'zeb-quix-9', email: 'zeb.quixote@secret.example', legal_name: 'Zebulon Q Public' }
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/from public\.reports r/i.test(sql)) {
          // Whatever else a row might carry, only the named columns are read out of it.
          return { rows: [{ category: 'spam', subject_kind: 'post', name: 'Oak Park Bakery', content_text: 'Buy my bread', image_url: null, reporter_is_builder: false, ...seeded }] }
        }
        return { rows: [] }
      }),
    }
    const bodies: string[] = []
    const fetch = vi.fn(async (_u: string, init: { body: string }) => {
      bodies.push(init.body)
      return new Response(JSON.stringify({ content: [{ type: 'tool_use', input: { category: 'spam', severity: 4, confidence: 0.9, outcome: 'approve', reason: 'r' } }], usage: {} }), { status: 200 })
    })
    await runAssessment('r1', db, { assess: (i) => assessContent(i, { fetch: fetch as never, env: { ANTHROPIC_MODERATION_KEY: 'k' } }), restore: async () => undefined })
    expect(bodies).toHaveLength(1)
    for (const v of Object.values(seeded)) expect(bodies[0]).not.toContain(v)
    expect(bodies[0]).not.toContain('@')
    expect(bodies[0]).toContain('Oak Park Bakery')
  })
})

describe('F100.6 — in shadow mode an assessment changes nothing', () => {
  const report = (id: string, over: Partial<QueuedReport>): QueuedReport => ({
    reportId: id, body: 'x', category: 'spam', reportedAt: new Date('2026-10-01T00:00:00Z'), hiddenAt: new Date('2026-10-02T00:00:00Z'), removedAt: null,
    groupId: id, groupName: id, groupSlug: id, photoUrl: null, ownerDisplayName: null, ownerHandle: null, history: [], subjectKind: 'group', subjectId: id, ...over,
  })

  // [guards F100.6 partial: the review queue's order and each row's severity are unchanged by an assessment row]
  it('the queue order and every severity are the same with or without the AI\'s read', () => {
    const plain = [report('a', { category: 'harassment' }), report('b', { category: 'spam' }), report('c', { category: 'nudity' })]
    const read = plain.map((r) => ({ ...r, ai: { category: 'other', severity: 1, confidence: 0.99, outcome: 'remove' as const, reason: 'looks bad' } }))
    const order = (qs: QueuedReport[]) => orderSubjects(groupBySubject(qs, { live: false })).map((s) => [s.subjectId, s.severity])
    expect(order(read)).toEqual(order(plain))
  })

  // [guards F100.6 partial: nothing in the moderation library hides, restores, removes, notifies or texts, apart from the restore step]
  it('nothing in src/lib/moderation reaches the hide, notify or text actions', () => {
    const FORBIDDEN = /notify|operator-sms|operator-alert|report\/(create|review|purge|answer)|@\/actions['"]|member_notices|photo_hidden_at|hidden_at\s*=/
    const offenders = SRC.filter((p) => rel(p).startsWith('src/lib/moderation/') && !rel(p).endsWith('key-check.ts'))
      .filter((p) => FORBIDDEN.test(read(rel(p))))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('the one thing that may restore is the reply-gated step, imported only by the assessment run (and a label on the review row)', () => {
    const importers = SRC.filter((p) => /ai-restore/.test(read(rel(p)))).map(rel).filter((p) => !p.startsWith('src/actions/report/')).sort()
    expect(importers).toEqual(['src/app/admin/reports/ReviewQueue.tsx', 'src/lib/moderation/run-assessment.ts'])
  })
})

describe('F100.12 — suspected severity-1 content never reaches a provider', () => {
  // [guards F100.12 partial: the provider's address is written in one moderation file; the others are named]
  it('api.anthropic.com is named only by the call itself, the key check and problem-report triage', () => {
    const files = SRC.filter((p) => /api\.anthropic\.com/.test(read(rel(p)))).map(rel).sort()
    expect(files).toEqual(['scripts/problem-reports.ts', 'src/lib/moderation/assess.ts', 'src/lib/moderation/key-check.ts'])
  })

  it('assessContent is called only by runAssessment and the harness', () => {
    const callers = SRC.filter((p) => /assessContent\(/.test(read(rel(p)))).map(rel).sort()
    expect(callers).toEqual(['src/lib/moderation/assess.ts', 'src/lib/moderation/eval-run.ts', 'src/lib/moderation/run-assessment.ts'])
  })

  it('the key check, which does reach the provider, sends no content: it only asks for the models list', () => {
    expect(read('src/lib/moderation/key-check.ts')).toMatch(/v1\/models/)
    expect(read('src/lib/moderation/key-check.ts')).not.toMatch(/messages/)
  })
})
