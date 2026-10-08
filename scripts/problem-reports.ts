// #443 — the member bug-report pipeline's runner (see docs/problem-reports.md).
//
//   file       — private reports with no Issue yet become scrubbed public Issues;
//                with ANTHROPIC_API_KEY, a cheap model labels and dedupes them.
//   heartbeat  — opens one Issue when the filing job has not run well for a day.
//
// SUPABASE_DB_URL and GITHUB_TOKEN come from the workflow; ANTHROPIC_API_KEY is optional.

import pg from 'pg'
import { filePendingReports, isStalled } from '../src/lib/problem-reports/pipeline'
import { triageIssue, type IssueRef, type TriageResult } from '../src/lib/problem-reports/triage'
import type { ProblemReportRow } from '../src/lib/problem-reports/public-issue'

const REPO = process.env.GITHUB_REPOSITORY ?? 'donlafranchi/socialus-web'
const GH = 'https://api.github.com'
const ghHeaders = { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GH}${path}`, { ...init, headers: { ...ghHeaders, 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  if (!res.ok) throw new Error(`GitHub ${init?.method ?? 'GET'} ${path}: ${res.status}`)
  return (await res.json()) as T
}

async function openIssues(): Promise<IssueRef[]> {
  const rows = await gh<{ number: number; title: string; pull_request?: unknown }[]>(`/repos/${REPO}/issues?state=open&per_page=100`)
  return rows.filter((r) => !r.pull_request).map((r) => ({ number: r.number, title: r.title }))
}

async function modelCall(req: { model: string; maxTokens: number; prompt: string }): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: req.model, max_tokens: req.maxTokens, messages: [{ role: 'user', content: req.prompt }] }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  return data.content?.find((c) => c.type === 'text')?.text ?? ''
}

async function applyTriage(issue: number, t: TriageResult) {
  const labels = [...(t.area ? [t.area] : []), ...(t.launchBlocking ? ['launch-blocking'] : [])]
  if (labels.length) await gh(`/repos/${REPO}/issues/${issue}/labels`, { method: 'POST', body: JSON.stringify({ labels }) })
  if (t.milestone) {
    const ms = await gh<{ number: number; title: string }[]>(`/repos/${REPO}/milestones?state=open&per_page=50`)
    const m = ms.find((x) => x.title === t.milestone)
    if (m) await gh(`/repos/${REPO}/issues/${issue}`, { method: 'PATCH', body: JSON.stringify({ milestone: m.number }) })
  }
  if (t.duplicateOf) {
    await gh(`/repos/${REPO}/issues/${issue}/comments`, { method: 'POST', body: JSON.stringify({ body: `Possible duplicate of #${t.duplicateOf} (triage agent; a person confirms).` }) })
  }
  await gh(`/repos/${REPO}/issues/${issue}/labels/needs-triage`, { method: 'DELETE' }).catch(() => {})
}

async function file() {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    const open = process.env.ANTHROPIC_API_KEY ? await openIssues() : []
    const result = await filePendingReports({
      fetchNew: async () => {
        const r = await db.query(
          `select id, created_at, member_id, role, route, build_sha, user_agent, description
             from public.problem_reports where issue_number is null order by created_at limit 50`,
        )
        return r.rows.map((x): ProblemReportRow => ({ id: x.id, createdAt: x.created_at, memberId: x.member_id, role: x.role, route: x.route, buildSha: x.build_sha, userAgent: x.user_agent, description: x.description }))
      },
      createIssue: async (i) => (await gh<{ number: number }>(`/repos/${REPO}/issues`, { method: 'POST', body: JSON.stringify(i) })).number,
      markFiled: async (id, n) => void (await db.query(`update public.problem_reports set issue_number = $2, filed_at = now() where id = $1`, [id, n])),
      triage: process.env.ANTHROPIC_API_KEY
        ? async (n, report) => {
            const issue = { number: n, title: '', body: '' }
            const { publicIssue } = await import('../src/lib/problem-reports/public-issue')
            const pub = publicIssue(report)
            const t = await triageIssue({ ...issue, title: pub.title, body: pub.body }, open, { call: modelCall })
            if (t) await applyTriage(n, t)
          }
        : undefined,
    })
    const line = `Filed ${result.filed.length} report(s)${result.failed.length ? `; ${result.failed.length} failed (will retry)` : ''}.`
    console.log(line)
    if (result.failed.length) {
      console.error(JSON.stringify(result.failed))
      process.exitCode = 1
    }
  } finally {
    await db.end()
  }
}

async function heartbeat() {
  const runs = await gh<{ workflow_runs: { created_at: string }[] }>(
    `/repos/${REPO}/actions/workflows/problem-reports.yml/runs?status=success&per_page=1`,
  )
  const last = runs.workflow_runs[0] ? new Date(runs.workflow_runs[0].created_at) : null
  if (!isStalled(last, new Date())) return console.log('The filing job ran in the last day.')
  const existing = await gh<{ number: number }[]>(`/repos/${REPO}/issues?state=open&labels=pipeline-stalled&per_page=1`)
  if (existing.length) return console.log('Already reported.')
  await gh(`/repos/${REPO}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'bug · the member bug-report pipeline has not run for a day',
      labels: ['bug', 'pipeline-stalled', 'launch-blocking'],
      body: [
        '**Kind:** bug',
        '**Scenario:** none',
        '**Path:** well-worn: a quiet pipeline cannot tell "no reports" from "not running"; this is the heartbeat.',
        '',
        `The "Problem reports" workflow has no successful run in over a day (last: ${last ? last.toISOString() : 'never'}). Member reports may be waiting in the private table. Check the workflow's last runs and the database secrets.`,
      ].join('\n'),
    }),
  })
  console.log('Opened a stalled-pipeline Issue.')
}

const mode = process.argv[2]
;(mode === 'heartbeat' ? heartbeat() : mode === 'file' ? file() : Promise.reject(new Error('usage: problem-reports.ts file|heartbeat'))).catch((e) => {
  console.error(e)
  process.exit(1)
})
