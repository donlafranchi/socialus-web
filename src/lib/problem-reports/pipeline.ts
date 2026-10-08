// #443 — filing private reports as public Issues, and the heartbeat. Pure
// orchestration: the database, GitHub and the model are injected, so each step is
// tested without them (scripts/problem-reports.ts wires the real ones).

import { publicIssue, type ProblemReportRow } from './public-issue'

export interface PipelineDeps {
  /** Reports with no Issue yet, oldest first. */
  fetchNew: () => Promise<ProblemReportRow[]>
  createIssue: (issue: { title: string; body: string; labels: string[] }) => Promise<number>
  markFiled: (reportId: string, issueNumber: number) => Promise<void>
  /** Optional cheap-model triage. A failure here never loses the filing. */
  triage?: (issueNumber: number, report: ProblemReportRow) => Promise<void>
}

export interface FilingResult {
  filed: { reportId: string; issue: number }[]
  failed: { reportId: string; error: string }[]
}

/** One flood must not become a burst of Issues and model calls. */
export const FILE_LIMIT_PER_RUN = 10

export async function filePendingReports(deps: PipelineDeps, opts: { limit?: number } = {}): Promise<FilingResult> {
  const limit = opts.limit ?? FILE_LIMIT_PER_RUN
  const result: FilingResult = { filed: [], failed: [] }
  for (const report of (await deps.fetchNew()).slice(0, limit)) {
    let issue: number
    try {
      issue = await deps.createIssue(publicIssue(report))
      // Recorded straight after the Issue exists: a crash after this line cannot file it twice.
      await deps.markFiled(report.id, issue)
    } catch (e) {
      result.failed.push({ reportId: report.id, error: e instanceof Error ? e.message : String(e) })
      continue
    }
    result.filed.push({ reportId: report.id, issue })
    if (deps.triage) await deps.triage(issue, report).catch(() => {})
  }
  return result
}

/** The heartbeat: a pipeline that has not run well for a day says so, because a quiet one cannot. */
export function isStalled(lastGoodRun: Date | null, now: Date, hours = 26): boolean {
  return !lastGoodRun || now.getTime() - lastGoodRun.getTime() > hours * 3_600_000
}
