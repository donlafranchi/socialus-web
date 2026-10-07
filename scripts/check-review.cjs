#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS, so actions/github-script can require() it */
// #396 — a UI PR carries the reviewer's first pass, or says why it was skipped.
// The PM, 2026-10-05 (socialus-ops process/PIPELINE.md § A reviewer's first pass).
// Usage: node scripts/check-review.cjs --self-test   (proves itself on the fixtures)
const fs = require('fs')
const path = require('path')

const UI = /^src\/(app|components)\//
const TEST = /\.test\.tsx?$/
const CHECKLIST = ['WCAG', 'state', 'primary action', 'thumb', 'horizontal scroll', 'voice', 'Nielsen', 'image', 'tidy and contained', 'tidiness verdict']

/** null when fine, else the problem. `files` are the PR's changed paths; `labels` its label names. */
function checkReview({ body, files, labels }) {
  if (!files.some((f) => UI.test(f) && !TEST.test(f))) return null
  const text = (body || '').replace(/<!--[\s\S]*?-->/g, '')
  if (labels.includes('review-skipped')) {
    return /review[- ]skipped\b[^\n]*\b(because|reason|:)\s*\S/i.test(text)
      ? null
      : 'labelled `review-skipped` but the body gives no reason (a line like `Review skipped: <why>`)'
  }
  if (!/^[\s>#*_-]*Reviewed by:/im.test(text)) {
    return 'a UI PR needs the reviewer\'s first pass: a `Reviewed by:` section with the UX checklist, or the `review-skipped` label and a reason'
  }
  const ticked = text.split(/\r?\n/).filter((l) => /^\s*[-*]\s*\[(x|X)\]/.test(l) || /^\s*[-*]\s*\[ \].*\bn\/a\b/i.test(l))
  const missing = CHECKLIST.filter((k) => !ticked.some((l) => l.toLowerCase().includes(k.toLowerCase())))
  return missing.length ? `the UX checklist is missing or unticked: ${missing.join(', ')}` : null
}

function selfTest() {
  const dir = path.join(__dirname, 'fixtures', 'review')
  let fail = 0
  for (const kind of ['good', 'bad']) {
    for (const f of fs.readdirSync(path.join(dir, kind))) {
      const c = JSON.parse(fs.readFileSync(path.join(dir, kind, f), 'utf8'))
      const e = checkReview(c)
      if (kind === 'bad' && !e) { console.log(`review: inert — accepted bad fixture ${f}`); fail++ }
      if (kind === 'good' && e) { console.log(`review: rejects good fixture ${f}: ${e}`); fail++ }
    }
  }
  if (fail) process.exit(1)
  console.log('review: self-test passed')
}

module.exports = { checkReview, CHECKLIST }

if (require.main === module) {
  if (process.argv[2] === '--self-test') selfTest()
  else { console.log('usage: check-review.cjs --self-test'); process.exit(2) }
}
