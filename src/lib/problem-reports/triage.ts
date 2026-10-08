// #443 — the triage agent. A cheap model (Haiku 4.5) labels the new Issue and
// checks it against the open ones; nothing it says is trusted past a whitelist.
// Spend: a small output cap, a trimmed prompt, at most FILE_LIMIT_PER_RUN calls a
// run, no call at all without ANTHROPIC_API_KEY, and the HARD monthly cap is set
// on the Anthropic workspace (see docs/problem-reports.md). Reproducing with a
// failing Playwright test and drafting a fix are not built here (they wait on the
// model bake-off and the PM's key).

export const TRIAGE_MODEL = 'claude-haiku-4-5-20251001'
export const TRIAGE_MAX_TOKENS = 300

const AREAS = ['page-editing', 'sign-in-you', 'explore-map', 'create-posts', 'sharing-links', 'builders-seed', 'moderation', 'ops'] as const
const MILESTONES = ['Beta 11-06', 'After beta'] as const

export interface IssueRef {
  number: number
  title: string
}
export interface TriageResult {
  area: string | null
  milestone: string | null
  duplicateOf: number | null
  launchBlocking: boolean
}

const OPEN_LIST_MAX = 150

export function buildTriagePrompt(issue: IssueRef & { body: string }, open: IssueRef[]): string {
  const list = open.slice(0, OPEN_LIST_MAX).map((i) => `#${i.number} ${i.title.slice(0, 90)}`).join('\n')
  return [
    'You triage a bug a member reported in a local-community app. Answer with JSON only.',
    `Keys: "area" (one of ${AREAS.map((a) => `area:${a}`).join(', ')}), "milestone" (one of ${MILESTONES.join(', ')}), "duplicateOf" (the number of an open Issue below that is the same bug, or null), "launchBlocking" (true only if an error screen or another member's data is shown to someone it should not be).`,
    'If unsure, use null and false. Do not invent Issue numbers.',
    '',
    `New Issue #${issue.number}: ${issue.title.slice(0, 120)}`,
    issue.body.slice(0, 1500),
    '',
    'Open Issues:',
    list,
  ].join('\n')
}

export function parseTriage(text: string, openNumbers: number[]): TriageResult {
  const none: TriageResult = { area: null, milestone: null, duplicateOf: null, launchBlocking: false }
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return none
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(m[0]) as Record<string, unknown>
  } catch {
    return none
  }
  const area = typeof raw.area === 'string' ? raw.area.replace(/^area:/, '') : null
  const milestone = typeof raw.milestone === 'string' ? raw.milestone : null
  const dup = typeof raw.duplicateOf === 'number' ? raw.duplicateOf : null
  return {
    area: area && (AREAS as readonly string[]).includes(area) ? `area:${area}` : null,
    milestone: milestone && (MILESTONES as readonly string[]).includes(milestone) ? milestone : null,
    duplicateOf: dup !== null && openNumbers.includes(dup) ? dup : null,
    launchBlocking: raw.launchBlocking === true,
  }
}

export interface ModelCall {
  (req: { model: string; maxTokens: number; prompt: string }): Promise<string>
}

export async function triageIssue(issue: IssueRef & { body: string }, open: IssueRef[], deps: { call?: ModelCall }): Promise<TriageResult | null> {
  if (!deps.call) return null
  const text = await deps.call({ model: TRIAGE_MODEL, maxTokens: TRIAGE_MAX_TOKENS, prompt: buildTriagePrompt(issue, open) })
  return parseTriage(text, open.map((o) => o.number))
}
