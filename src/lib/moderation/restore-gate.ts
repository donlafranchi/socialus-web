// F102 criterion 12 (ruled B, the PM 2026-10-05) — when the AI may restore
// severity-4 reported content on its own. Pure: the caller gathers the facts.
//
// Every gate must hold. Severities 1-3 never restore without a person, and
// severity 1 never reaches an AI at all (run-assessment skips it), so a missing
// read blocks too. 'shadow' and 'not_cleared' block the ACT but not the
// would-restore, so the agreement view still learns what the AI would have done.

export const RESTORE_CONFIDENCE = 0.95

export type RestoreBlock = 'shadow' | 'not_cleared' | 'not_severity_4' | 'no_answer' | 'haiku' | 'sonnet' | 'coordinated'

export interface RestoreRead {
  model: string
  severity: number
  confidence: number
  outcome: 'approve' | 'remove'
}

export interface RestoreFacts {
  aiMode: 'shadow' | 'live'
  /** moderation_settings.severity4_restore_cleared: set by an operator after the harness clears F100.11 on the severity-4 slice. */
  cleared: boolean
  /** The severity of the reason on each open report on the subject; null when a report names none. */
  reporterSeverities: (1 | 2 | 3 | 4 | null)[]
  /** The poster gave the "this report is wrong" answer. */
  answered: boolean
  coordinated: boolean
  haiku: RestoreRead | null
  sonnet: RestoreRead | null
}

const approves = (r: RestoreRead | null) => r !== null && r.outcome === 'approve' && r.confidence >= RESTORE_CONFIDENCE

export function restoreVerdict(f: RestoreFacts): { act: boolean; wouldRestore: boolean; blockedBy: RestoreBlock[] } {
  const substantive: RestoreBlock[] = []
  const severe =
    f.reporterSeverities.length === 0 ||
    f.reporterSeverities.some((s) => s !== 4) ||
    [f.haiku, f.sonnet].some((r) => r !== null && r.severity !== 4)
  if (severe) substantive.push('not_severity_4')
  if (!f.answered) substantive.push('no_answer')
  if (!approves(f.haiku)) substantive.push('haiku')
  if (!approves(f.sonnet)) substantive.push('sonnet')
  if (f.coordinated) substantive.push('coordinated')

  const blockedBy = [...substantive]
  if (f.aiMode !== 'live') blockedBy.push('shadow')
  if (!f.cleared) blockedBy.push('not_cleared')
  return { act: blockedBy.length === 0, wouldRestore: substantive.length === 0, blockedBy }
}

/** Sonnet runs on every such candidate, not only below the escalation threshold: decided from the first read. */
export function isRestoreCandidate(
  first: RestoreRead,
  { rebuttal, reporterSeverity }: { rebuttal: string | null; reporterSeverity: number | null },
): boolean {
  return Boolean(rebuttal) && reporterSeverity === 4 && first.severity === 4 && approves(first)
}
