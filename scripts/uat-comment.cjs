#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS, so actions/github-script can require() it */
// A comment on a `uat` Issue names criteria by id (F081.3) and says whether they are ok. GitHub task lists cannot carry
// per-item comments, so the id in a comment is the signal. Usage: node scripts/uat-comment.cjs --self-test
const ID = /\bF\d{3}\.\d+[a-z]?\b/g
const NOT_OK = /not\s*ok\b|✗|✘|\bwrong\b|\bbroken\b|\bfails?\b|\bfailed\b|doesn'?t work/i
const OK = /\b(?:is |looks? |works? |all )?(?:ok|okay|fine|good|works)\b/i

// Returns { notOk: [{ id, text }], ok: [id] } for one comment body, line by line.
function parse(body) {
  const notOk = []
  const ok = []
  for (const line of (body || '').split(/\r?\n/)) {
    const ids = line.match(ID)
    if (!ids) continue
    const text = line.replace(/^[\s>*-]+/, '').trim()
    if (NOT_OK.test(line)) for (const id of new Set(ids)) notOk.push({ id, text })
    else if (OK.test(line)) for (const id of new Set(ids)) ok.push(id)
  }
  return { notOk, ok }
}

function selfTest() {
  const cases = [
    ['plain not ok', parse('F081.3 not ok: the zip shows on the profile').notOk.map((x) => x.id).join(), 'F081.3'],
    ['two ids one line', parse('F078.8 and F078.9 are broken').notOk.map((x) => x.id).join(), 'F078.8,F078.9'],
    ['suffix ids', parse('F059.2b wrong').notOk.map((x) => x.id).join(), 'F059.2b'],
    ['ok line is not a bug', parse('F081.3 ok, looks good').notOk.length, 0],
    ['ok line is recorded ok', parse('F081.3 ok, looks good').ok.join(), 'F081.3'],
    ['no id, no bug', parse('this whole sheet is wrong').notOk.length, 0],
    ['quoted line', parse('> F082.7 not ok on a phone').notOk.map((x) => x.text).join(), 'F082.7 not ok on a phone'],
    ['mixed comment', parse('F058.1 ok\nF058.3 not ok: no Remove photo').notOk.map((x) => x.id).join(), 'F058.3'],
  ]
  let fail = 0
  for (const [name, got, want] of cases) if (got !== want) { console.log(`uat-comment: wrong on "${name}": got ${got}`); fail++ }
  if (fail) process.exit(1)
  console.log('uat-comment: self-test ok')
}

if (require.main === module && process.argv[2] === '--self-test') selfTest()
module.exports = { parse }
