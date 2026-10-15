// #790 — what the live smoke's bug report lists: each failed test and the first line of its
// reason, read from Playwright's numbered failure blocks. Never the [n/m] progress lines.
function smokeFailures(log, max = 12) {
  const out = []
  const blocks = log.split(/\n(?=\s+\d+\) \[)/)
  for (const b of blocks) {
    const head = b.match(/^\s+\d+\) \[(smoke-live)\] › [^›]+› (.+?)\s*─*\s*$/m)
    if (!head) continue
    const reason = (b.match(/^\s+\+\s+"(.+)$/m) || b.match(/^\s+Error: (.+)$/m) || [])[1]
    out.push(`${head[2].trim()}${reason ? `: ${reason.trim()}` : ''}`)
    if (out.length >= max) break
  }
  return [...new Set(out)].join('\n')
}
module.exports = { smokeFailures }
