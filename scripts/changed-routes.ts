// chore #428 — which screens can this diff change, and who should look at them?
//
//   npx tsx scripts/changed-routes.ts --base <sha>      prints JSON
//   npx tsx scripts/changed-routes.ts --since "26 hours ago"   everything merged to main since then
//   npx tsx scripts/changed-routes.ts --base <sha> --github-output   also writes routes= / personas= to $GITHUB_OUTPUT
//
// A route is a name in evals/screens/routes.ts. A change it cannot place under
// src/ falls back to the common screens (explore, page, you; `fallback: 'smoke'`) rather than to nothing.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { PERSONAS } from '../evals/personas'

const PAGE = ['page', 'page-business', 'page-private']
const COMMON = ['page', 'page-private', 'explore', 'you']

/** [path pattern, routes], first match wins per file. */
export const ROUTE_MAP: [RegExp, string[]][] = [
  [/^src\/components\/group\/edit\//, ['page-edit']],
  [/^src\/app\/g\/\[handle\]\/edit\//, ['page-edit']],
  [/^src\/app\/g\//, [...PAGE, 'page-edit', 'page-not-found']],
  [/^src\/components\/(group|locations|follows|media|cards)\//, [...PAGE, 'page-edit']],
  [/^src\/app\/explore\//, ['explore', 'explore-map']],
  [/^src\/components\/(explore|browse|feed)\//, ['explore', 'explore-map']],
  [/^src\/app\/following\//, ['following']],
  [/^src\/app\/you\//, ['you', 'you-following', 'you-following-tab', 'you-saved-tab', 'you-settings-tab']],
  [/^src\/components\/(member|you)\//, ['you']],
  [/^src\/app\/(m)\//, ['member-profile', 'member-product', 'member-service', 'member-gathering']],
  [/^src\/app\/p\//, ['place', 'venue', 'page-gathering', 'page-product', 'page-service']],
  [/^src\/app\/auth\//, ['auth-login', 'auth-password']],
  [/^src\/components\/auth\//, ['auth-login', 'auth-password']],
  [/^src\/app\/admin\//, ['admin-reports']],
  [/^src\/components\/admin\//, ['admin-reports']],
  [/^src\/app\/(onboarding|create|join)\//, ['onboarding', 'join']],
  [/^src\/components\/(onboarding|create)\//, ['onboarding']],
  [/^src\/app\/(page|layout|not-found|error)\.tsx$/, ['root', 'explore']],
  [/^src\/components\/[A-Za-z]+\.tsx$/, ['explore', 'page', 'you']],
  [/^(supabase\/|src\/actions\/)/, COMMON],
]

const OWNER_ONLY = ['signedOut', 'stranger', 'operator', 'ownerBusiness', 'ownerPlace']
const IGNORED = /(\.test\.tsx?$|\.md$|^docs\/|^build-log\/|^\.github\/|^tests\/|^evals\/|^scripts\/)/

export interface ChangedRoutes {
  routes: string[]
  personas: string[]
  widths: number[]
  /** Set when a runtime change under src/ could not be placed. */
  fallback?: 'smoke'
}

export function changedRoutes(files: string[]): ChangedRoutes {
  const routes = new Set<string>()
  let unplaced = false
  let fallbackUsed = false
  for (const f of files.filter((x) => !IGNORED.test(x))) {
    const hit = ROUTE_MAP.find(([re]) => re.test(f))
    if (hit) hit[1].forEach((r) => routes.add(r))
    else if (/^src\//.test(f)) unplaced = true
  }
  if (unplaced && routes.size === 0) {
    fallbackUsed = true
    ;['explore', 'page', 'you'].forEach((r) => routes.add(r))
  }
  const list = [...routes]
  const ownerOnly = list.length > 0 && list.every((r) => r === 'page-edit')
  const personas = ownerOnly ? OWNER_ONLY : PERSONAS.map((p) => p.key)
  return { routes: list, personas, widths: [390, 1280], ...(unplaced && fallbackUsed ? { fallback: 'smoke' as const } : {}) }
}

if (require.main === module) {
  const i = process.argv.indexOf('--base')
  const j = process.argv.indexOf('--since')
  let base = i > 0 ? process.argv[i + 1]! : 'origin/main'
  if (j > 0) {
    // Everything merged to main since then: from the parent of the oldest such commit.
    const log = execFileSync('git', ['log', `--since=${process.argv[j + 1]}`, '--format=%H', 'origin/main'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    base = log.length ? `${log[log.length - 1]}^` : 'origin/main'
  }
  // Two dots: in CI HEAD is the PR's merge commit, so base..HEAD is exactly the PR's changes
  // and needs no merge-base history (the checkout is shallow).
  const out = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' })
  const result = changedRoutes(out.split('\n').filter(Boolean))
  console.log(JSON.stringify(result))
  if (process.argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `routes=${result.routes.join(',')}\npersonas=${result.personas.join(',')}\nwidths=${result.widths.join(',')}\nfallback=${result.fallback ?? ''}\n`,
    )
  }
}
