#!/usr/bin/env node
// A closed `uat` Issue: every checkbox ticked => what it names is reviewed. Anything else => not.
// Usage: node scripts/uat-close.cjs --self-test   (proves itself on inline fixtures)
function parse(body, self) {
  const text = (body || '').replace(/<!--[\s\S]*?-->/g, '')
  const boxes = text.split(/\r?\n/).filter((l) => /^\s*[-*]\s+\[[ xX]\]/.test(l))
  const unchecked = boxes.filter((l) => /\[ \]/.test(l))
  const linked = [...new Set([...text.matchAll(/#(\d+)\b/g)].map((m) => Number(m[1])))].filter((n) => n !== self)
  return { total: boxes.length, unchecked: unchecked.length, linked, reviewed: boxes.length > 0 && unchecked.length === 0 }
}

function selfTest() {
  const cases = [
    ['all ticked', '- [x] a #5\n- [X] b #6', true],
    ['one unticked', '- [x] a #5\n- [ ] b #6', false],
    ['no boxes', 'Covers #5 and #6', false],
    ['box only in a comment', '<!-- - [x] a -->\n#5', false],
  ]
  let fail = 0
  for (const [name, body, want] of cases) {
    if (parse(body, 0).reviewed !== want) { console.log(`uat-close: wrong on "${name}"`); fail++ }
  }
  if (parse('- [x] a #5 #9', 9).linked.join() !== '5') { console.log('uat-close: linked must drop the Issue itself'); fail++ }
  if (fail) process.exit(1)
  console.log('uat-close: self-test ok')
}

if (require.main === module && process.argv[2] === '--self-test') selfTest()
module.exports = { parse }
