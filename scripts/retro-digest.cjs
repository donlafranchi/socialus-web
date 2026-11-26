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

const scoresStale = (last, now) => !last || (now - new Date(`${last}T00:00:00Z`)) / 86400000 > 7

// measurePrs: every PR since measureStart (the measure spans weeks); defaults to this week's.
function render({ from, to, prs, alarms, scoresLast, now, measureStart, measurePrs = prs }) {
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
    '### For the agent pass',
    '- The rule (PR-0003, trial; the PM picked A, 2026-11-26): a finding seen in three or more PRs becomes a check with a bad fixture, or is recorded as judgement-only. Its trial measure is the 30-PR recount above.',
    '- Read the reviewed PRs above: what repeated, by class; fill the column.',
    '- Build at most one new check, proven on a bad fixture, or say in one line why none. Remove a check that wrongly failed more than 2 PRs.',
    '- Message the PM only for a judgement call.',
  ].join('\n')
}

module.exports = { isCodePR, measure, scoresStale, render, BASELINE, MEASURE_OF }
