#!/usr/bin/env node
// #1433 — the weekly retro's digest: what a script can count from the week's PRs, alarms and scores.
// The agent pass reads it and the week's reviews, writes what repeated, and builds at most one check.

const DOCS = [/\.md$/i, /^docs\//, /^build-log\//]
const isCodePR = (files) => files.some((f) => !DOCS.some((re) => re.test(f)))

// The PM's measured experiment (#1433): 38 reviewed code PRs, 2026-10-21..11-17.
const BASELINE = {
  reviewed: 38,
  classes: [
    { name: 'guard marker missing or partial', prs: 8 },
    { name: 'new definer function without its siblings\' predicate', prs: 8 },
    { name: 'member-facing wording (British spelling, a banned word)', prs: 6 },
    { name: 'accessibility markup', prs: 7 },
  ],
}
const MEASURE_OF = 30

function measure(prs, start) {
  const counted = prs
    .filter((p) => p.reviewed && isCodePR(p.files) && p.mergedAt.slice(0, 10) >= start)
    .sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))
    .slice(0, MEASURE_OF)
    .map((p) => p.number)
  return { counted, of: MEASURE_OF, done: counted.length >= MEASURE_OF }
}

// EX-0001 (the PM picked A, 2026-11-27): what each merged change cost, for 4 weeks.
// Pushes are distinct head commits CI saw; CI minutes are wall-clock run time.
// Token spend has no source on GitHub yet, so it is not counted.
const COST = { experiment: 'EX-0001', from: '2026-11-30', verdict: '2026-12-28' }

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
const one = (x) => (x === null || x === undefined ? '—' : String(Math.round(x * 10) / 10))

// The Issue a PR closes, from its body's closing keyword (GitHub's own list).
function closesIssue(body) {
  const m = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)/i.exec(body || '')
  return m ? Number(m[1]) : null
}

// One PR's cost from its branch's pull_request workflow runs ({ head_sha, run_started_at, updated_at }).
function costOf({ number, runs, mergedAt, issueCreatedAt }) {
  const pushes = new Set(runs.map((r) => r.head_sha)).size
  const ms = runs.reduce((t, r) => t + Math.max(0, new Date(r.updated_at) - new Date(r.run_started_at || r.created_at)), 0)
  const days = issueCreatedAt ? (new Date(mergedAt) - new Date(issueCreatedAt)) / 86400000 : null
  return { number, pushes, ciMinutes: ms / 60000, issueToMergeDays: days }
}

// costs: [{ number, pushes, ciMinutes, issueToMergeDays }] for this week's code PRs.
function costLines(costs, now) {
  if (!costs) return ['### What each change cost: not read this week (the cost step failed; see the run log).']
  const live = now.toISOString().slice(0, 10) >= COST.from
  const head = `### What each change cost (${COST.experiment}, ${COST.from} to ${COST.verdict}${live ? '' : ', not started yet'})`
  if (!costs.length) return [head, '', 'No code PRs merged this week.']
  return [
    head,
    '',
    `**Medians:** ${one(median(costs.map((c) => c.pushes)))} pushes, ${one(median(costs.map((c) => c.ciMinutes)))} CI minutes, ${one(median(costs.map((c) => c.issueToMergeDays)))} days from Issue to merge. Tokens: no source yet.`,
    '',
    '| PR | Pushes | CI minutes | Issue to merge (days) |',
    '|---|---|---|---|',
    ...costs.map((c) => `| #${c.number} | ${one(c.pushes)} | ${one(c.ciMinutes)} | ${one(c.issueToMergeDays)} |`),
  ]
}

// upkeep: the store's upkeep rows ({ id, kind, answer, problem }), or null when it could not be read.
function upkeepLines(upkeep) {
  if (!upkeep) return ['### Upkeep: not read this week (the store step failed; see the run log).']
  if (!upkeep.length) return ['### Upkeep: nothing due', '', 'Every rule reconfirmed in 90 days, no experiment past its verdict date, every routine run in its interval, no idea open over 90 days.']
  return [`### Upkeep: ${upkeep.length} due`, '', ...upkeep.map((u) => `- ${u.id} (${u.kind}): ${u.problem}. ${u.answer}`)]
}

const scoresStale = (last, now) => !last || (now - new Date(`${last}T00:00:00Z`)) / 86400000 > 7

// measurePrs: every PR since measureStart (the measure spans weeks); defaults to this week's.
// costs and upkeep: undefined (not passed) leaves their sections out; null says they could not be read.
function render({ from, to, prs, alarms, scoresLast, now, measureStart, measurePrs = prs, costs, upkeep }) {
  const code = prs.filter((p) => isCodePR(p.files))
  const reviewed = code.filter((p) => p.reviewed)
  const skipped = code.filter((p) => !p.reviewed)
  const m = measure(measurePrs, measureStart)
  const list = (xs) => (xs.length ? xs.map((p) => `#${p.number}`).join(', ') : 'none')
  const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—')
  return [
    `## Weekly retro digest, ${from} to ${to}`,
    '',
    `**Code PRs merged:** ${code.length}. **Reviewed:** ${list(reviewed)}.`,
    `**No review:** ${list(skipped)}.`,
    `**Alarm Issues:** ${alarms.length ? alarms.map((a) => `#${a.number} ${a.title} (${a.state}${a.needsReview ? ', needs-review' : ''})`).join('; ') : 'none'}.`,
    `**Scores:** last row ${scoresLast || 'none'}${scoresStale(scoresLast, now) ? ', stale (no run in 7 days)' : ''}.`,
    '',
    `### Measured (#1433): ${m.counted.length} of ${m.of} reviewed code PRs since ${measureStart}${m.done ? ', done: compare and remove what has not halved' : ''}`,
    '',
    '| Class | Baseline (of 38) | Since start (agent counts) |',
    '|---|---|---|',
    ...BASELINE.classes.map((c) => `| ${c.name} | ${c.prs} (${pct(c.prs, BASELINE.reviewed)}) | |`),
    '',
    ...(upkeep === undefined ? [] : [...upkeepLines(upkeep), '']),
    ...(costs === undefined ? [] : [...costLines(costs, now), '']),
    '### For the agent pass',
    '- The rule (PR-0003, trial; the PM picked A, 2026-11-26): a finding seen in three or more PRs becomes a check with a bad fixture, or is recorded as judgement-only. Its trial measure is the 30-PR recount above.',
    '- Read the reviewed PRs above: what repeated, by class; fill the column.',
    '- Build at most one new check, proven on a bad fixture, or say in one line why none. Remove a check that wrongly failed more than 2 PRs.',
    ...(upkeep && upkeep.length ? ['- Upkeep: reconfirm each rule listed (or propose retiring it), and give each overdue experiment its verdict.'] : []),
    '- Message the PM only for a judgement call.',
  ].join('\n')
}

module.exports = { isCodePR, measure, scoresStale, render, median, closesIssue, costOf, costLines, upkeepLines, BASELINE, MEASURE_OF, COST }
