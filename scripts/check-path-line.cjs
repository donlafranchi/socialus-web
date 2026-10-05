#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS, so actions/github-script can require() it */
// Every Issue and PR body carries a `Path:` line: `well-worn` or `new territory`.
// Don's decision rule, 2026-10-04 (ops-pattern/process/PIPELINE.md § Decision rule).
// Usage: node scripts/check-path-line.cjs <body.md>   |   --self-test   (proves itself on the fixtures)
const fs = require('fs')
const path = require('path')

const PATH_LINE = /^[\s>*_-]*Path:[*_\s]*/i
const VALUES = ['well-worn', 'new territory']

function checkPath(body) {
  const text = (body || '').replace(/<!--[\s\S]*?-->/g, '')
  const lines = text.split(/\r?\n/).filter((l) => PATH_LINE.test(l))
  if (!lines.length) return 'missing `Path:` line — `Path: well-worn` or `Path: new territory` (decision rule, 2026-10-04)'
  const ok = lines.some((l) => {
    const v = l.replace(PATH_LINE, '').toLowerCase()
    const named = VALUES.filter((x) => v.includes(x))
    return named.length === 1 && v.startsWith(named[0])
  })
  return ok ? null : '`Path:` must name exactly one of `well-worn` or `new territory`'
}

function selfTest() {
  const dir = path.join(__dirname, 'fixtures', 'path-line')
  const read = (k) => fs.readdirSync(path.join(dir, k)).map((f) => [f, fs.readFileSync(path.join(dir, k, f), 'utf8')])
  let fail = 0
  for (const [f, b] of read('bad')) if (!checkPath(b)) { console.log(`path-line: inert — accepted bad fixture ${f}`); fail++ }
  for (const [f, b] of read('good')) { const e = checkPath(b); if (e) { console.log(`path-line: rejects good fixture ${f}: ${e}`); fail++ } }
  if (fail) process.exit(1)
  console.log('path-line: self-test passed')
}

module.exports = { checkPath }

if (require.main === module) {
  const arg = process.argv[2]
  if (arg === '--self-test') selfTest()
  else if (arg) { const e = checkPath(fs.readFileSync(arg, 'utf8')); if (e) { console.log(`path-line: ${e}`); process.exit(1) } }
  else { console.log('usage: check-path-line.cjs <body.md> | --self-test'); process.exit(2) }
}
