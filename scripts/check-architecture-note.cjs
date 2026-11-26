#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS, so actions/github-script can require() it */
// #1434 — a ticket whose `Touches:` line names schema, RLS or routes opens with an architecture note of at most
// 20 lines and a `Visibility:` line (practice.architecture-note-first; socialus-ops PIPELINE-build.md step 6).
// A ticket with no `Touches:` line, or `Touches: none`, is not judged.
// Usage: node scripts/check-architecture-note.cjs --self-test   (proves itself on the fixtures)
const fs = require('fs')
const path = require('path')

const MAX_LINES = 20
const field = (name) => new RegExp(`^[\\s>*_-]*${name}:[*_]*\\s*(.*)$`, 'i')
const NOTE = /^[\s#>*_-]*Architecture note\b[*_:]*\s*(.*)$/i
const HEADING = /^\s*#/

function checkNote(body) {
  const lines = (body || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)
  const touches = lines.map((l) => l.match(field('Touches'))).find(Boolean)
  if (!touches || !/\b(schema|rls|routes?|access rules?)\b/i.test(touches[1])) return null
  const problems = []
  const at = lines.findIndex((l) => NOTE.test(l))
  if (at < 0) problems.push('touches schema, RLS or routes but has no `Architecture note`')
  else {
    const content = [lines[at].match(NOTE)[1]]
    for (const l of lines.slice(at + 1)) {
      if (HEADING.test(l) || field('Visibility').test(l)) break
      content.push(l)
    }
    const filled = content.filter((l) => l.replace(/[*_\s-]/g, '').length > 0)
    if (!filled.length) problems.push('the `Architecture note` is empty')
    if (filled.length > MAX_LINES) problems.push(`the \`Architecture note\` runs ${filled.length} lines; at most ${MAX_LINES}`)
  }
  const vis = lines.map((l) => l.match(field('Visibility'))).find(Boolean)
  if (!vis || !vis[1].replace(/[*_\s]/g, '')) problems.push('touches schema, RLS or routes but has no filled `Visibility:` line (who can read and write what)')
  return problems.length ? problems.join('; ') : null
}

function selfTest() {
  const dir = path.join(__dirname, 'fixtures', 'architecture-note')
  const read = (k) => fs.readdirSync(path.join(dir, k)).map((f) => [f, fs.readFileSync(path.join(dir, k, f), 'utf8')])
  let fail = 0
  for (const [f, b] of read('bad')) if (!checkNote(b)) { console.log(`architecture-note: inert — accepted bad fixture ${f}`); fail++ }
  for (const [f, b] of read('good')) { const e = checkNote(b); if (e) { console.log(`architecture-note: rejects good fixture ${f}: ${e}`); fail++ } }
  if (fail) process.exit(1)
  console.log('architecture-note: self-test passed')
}

module.exports = { checkNote }

if (require.main === module) {
  if (process.argv[2] === '--self-test') selfTest()
  else { console.log('usage: check-architecture-note.cjs --self-test'); process.exit(2) }
}
