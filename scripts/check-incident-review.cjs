#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS, so actions/github-script can require() it */
// #1432 — an Issue an alarm opened closes with a three-line incident review, in any one comment:
//   Broke: what broke · Not caught: why no check caught it · Check: the check added, or why none
// or one line `False alarm: why`. Blameless and short (Google SRE postmortems, PagerDuty).
// Usage: node scripts/check-incident-review.cjs --self-test   (proves itself on the fixtures)
const fs = require('fs')
const path = require('path')

// The titles the alarm workflows open; new ones carry the `alarm` label as well.
const ALARM_TITLES = [
  'bug · main fails to build on Vercel',
  'bug · live: the overnight smoke found a problem',
  'bug · socialus.org is down',
  'bug · live: taps are slower than budget',
  'bug · backup restore test failed',
  'bug · the daily knowledge import dry run fails',
]
const FIELDS = ['Broke', 'Not caught', 'Check']
const PROMPT =
  'Incident review (#1432): before this closes, reply with three lines: `Broke:` what broke, `Not caught:` why no check caught it, `Check:` the check added or why none. A false alarm is one line: `False alarm:` why.'

const filled = (text, field) =>
  text.split(/\r?\n/).some((l) => {
    const m = l.match(new RegExp(`^[\\s>*_-]*${field}:[*_]*\\s*(.*)$`, 'i'))
    return !!m && m[1].replace(/[*_\s]/g, '').length > 0
  })

const hasReview = (comments) =>
  comments.some((c) => {
    const text = (c || '').replace(/<!--[\s\S]*?-->/g, '')
    return filled(text, 'False alarm') || FIELDS.every((f) => filled(text, f))
  })

const isAlarm = (issue) =>
  (issue.labels || []).some((l) => (typeof l === 'string' ? l : l.name) === 'alarm') || ALARM_TITLES.includes(issue.title)

function selfTest() {
  const dir = path.join(__dirname, 'fixtures', 'incident-review')
  const read = (k) => fs.readdirSync(path.join(dir, k)).map((f) => [f, fs.readFileSync(path.join(dir, k, f), 'utf8')])
  let fail = 0
  for (const [f, b] of read('bad')) if (hasReview([b])) { console.log(`incident-review: inert — accepted bad fixture ${f}`); fail++ }
  for (const [f, b] of read('good')) if (!hasReview([b])) { console.log(`incident-review: rejects good fixture ${f}`); fail++ }
  if (!isAlarm({ title: 'bug · socialus.org is down', labels: [] }) || !isAlarm({ title: 'x', labels: [{ name: 'alarm' }] }) || isAlarm({ title: 'bug · a typo', labels: ['bug'] })) {
    console.log('incident-review: isAlarm is wrong'); fail++
  }
  if (fail) process.exit(1)
  console.log('incident-review: self-test passed')
}

module.exports = { hasReview, isAlarm, ALARM_TITLES, PROMPT }

if (require.main === module) {
  if (process.argv[2] === '--self-test') selfTest()
  else { console.log('usage: check-incident-review.cjs --self-test'); process.exit(2) }
}
