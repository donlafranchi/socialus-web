// F100 criterion 9 — runs the current prompt and models against the labelled
// set in evals/moderation/cases.json and prints recall, false-alarm rate,
// severity accuracy, latency and cost per case. Run on every prompt change:
//   npm run moderation:eval            (needs ANTHROPIC_API_KEY)
//   npm run moderation:eval -- --check (validates the set only; no key, no cost)
// Cases carry text, a picture, or both. Pictures are synthetic (drawn by
// scripts/moderation-make-images.ts) or open-licensed, with the licence recorded
// per image in evals/moderation/images/LICENCES.json (criterion 10): nothing
// runs unless every image is licensed and allowed.

import { existsSync, readFileSync } from 'node:fs'
import { validateSet, type EvalCase, type ImageLicence } from '../src/lib/moderation/eval-cases'
import { runSet } from '../src/lib/moderation/eval-run'

const DIR = 'evals/moderation'

async function main() {
  const cases: EvalCase[] = JSON.parse(readFileSync(`${DIR}/cases.json`, 'utf8'))
  const licences: ImageLicence[] = JSON.parse(readFileSync(`${DIR}/images/LICENCES.json`, 'utf8'))
  const problems = validateSet(cases, licences, (f) => existsSync(`${DIR}/images/${f}`))
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  if (process.argv.includes('--check')) {
    console.log(`${cases.length} cases, ${cases.filter((c) => c.image).length} with a picture: set is valid.`)
    return
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY to run the harness (or pass --check to validate the set only).')
    process.exit(1)
  }
  const { summary, rows } = await runSet(cases, {
    readImage: (f) => ({ mediaType: 'image/png', base64: readFileSync(`${DIR}/images/${f}`).toString('base64') }),
  })
  for (const r of rows) console.log(`${r.id}: want ${r.want}, got ${r.got}`)
  console.table(summary)
  console.log(summary.meetsLiveTargets ? 'Meets the live-mode targets (criterion 11, before the two weeks of shadow agreement).' : 'Does not meet the live-mode targets.')
}

main()
