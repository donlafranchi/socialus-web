#!/usr/bin/env tsx
// #295 — reads every screen file and checks it against the token baseline.
//   tsx scripts/visual-tokens.ts                  report, exit 1 on any violation
//   tsx scripts/visual-tokens.ts --write-baseline rewrite the baseline from the tree
// Write the baseline only to remove entries a screen no longer needs; adding a
// new one-off to it defeats the check.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkVisualTokens, oneOffs, type Baseline } from '../src/lib/design/visual-tokens-check'

export const BASELINE_PATH = 'src/lib/design/visual-tokens-baseline.json'

export function screenFiles(): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
    )
  for (const f of walk('src')) {
    if (/\.test\.tsx?$/.test(f) || f.startsWith('src/lib/design/')) continue
    files[f] = readFileSync(f, 'utf8')
  }
  return files
}

if (process.argv[1]?.endsWith('visual-tokens.ts')) {
  const files = screenFiles()
  if (process.argv.includes('--write-baseline')) {
    const baseline: Baseline = {}
    for (const [f, src] of Object.entries(files)) {
      const v = oneOffs(src)
      if (v.length) baseline[f] = v
    }
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
    console.log(`visual-tokens: baseline written, ${Object.values(baseline).flat().length} entries`)
  } else {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
    const v = checkVisualTokens(files, baseline)
    for (const x of v) console.log(`${x.kind}: ${x.file} ${x.value}`)
    console.log(v.length ? `visual-tokens: ${v.length} violation(s)` : 'visual-tokens: OK')
    process.exit(v.length ? 1 : 0)
  }
}
