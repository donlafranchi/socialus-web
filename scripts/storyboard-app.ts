#!/usr/bin/env tsx
// #713 — the app storyboard: every routed screen at 390px, grouped by area, one
// strip per persona, as one plain HTML page beside the pictures. Built on
// request from the screenshot matrix (or a review bundle); never committed.
//
//   npm run storyboard:app                         reads screenshots/390/**, writes screenshots/storyboard.html
//   npm run storyboard:app -- --base <sha>         only the routes that diff can change (scripts/changed-routes.ts)
//   npm run storyboard:app -- --routes explore,you only these routes
//   npm run storyboard:app -- --dir review-bundle  another capture folder with the same layout

import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PERSONAS } from '../evals/personas'
import { ROUTES } from '../evals/screens/routes'
import { renderStoryboard, type Strip } from './builders/storyboard'
import { changedRoutes, diffFiles } from './changed-routes'

const WIDTH = 390

const AREAS: [string, RegExp][] = [
  ['Explore and map', /^(root|explore|explore-map|following|map-redirect|place|place-not-found|venue|venue-not-found)$/],
  ['Pages', /^(page|page-.+|place-page-redirect|business-redirect|join)$/],
  ['Members', /^member-/],
  ['Report and moderation', /^(report-.+|admin-reports)$/],
  ['Sign in and You', /^(auth-.+|onboarding|you|you-.+|qr-redirect|register-business-redirect)$/],
  ['Demos', /^(card-gallery|playground|.+-demo)$/],
]
const OTHER = 'Other'

export const areaOf = (route: string) => AREAS.find(([, re]) => re.test(route))?.[0] ?? OTHER

const rank = (list: string[], x: string) => (list.includes(x) ? list.indexOf(x) : list.length)

/** `files` are `<persona>/<route>.png`, relative to the width folder. */
export function appSections(files: string[], only?: Set<string>): Strip[] {
  const areas = [...AREAS.map(([a]) => a), OTHER]
  const personas = PERSONAS.map((p) => p.key as string)
  const routes = ROUTES.map((r) => r.name)
  const shots = files
    .map((f) => f.match(/^([^/]+)\/([^/]+)\.png$/))
    .filter((m): m is RegExpMatchArray => !!m && (!only || only.has(m[2]!)))
    .map((m) => ({ persona: m[1]!, route: m[2]!, area: areaOf(m[2]!) }))
    .sort((a, b) => rank(areas, a.area) - rank(areas, b.area) || rank(personas, a.persona) - rank(personas, b.persona) || rank(routes, a.route) - rank(routes, b.route) || a.route.localeCompare(b.route))
  const strips = new Map<string, Strip>()
  for (const s of shots) {
    const key = `${s.area}|${s.persona}`
    if (!strips.has(key)) strips.set(key, { heading: s.area, sub: s.persona, frames: [] })
    strips.get(key)!.frames.push({ src: `${WIDTH}/${s.persona}/${s.route}.png`, caption: s.route })
  }
  return [...strips.values()]
}

export const appStoryboard = (strips: Strip[], date: string) =>
  renderStoryboard(`App storyboard, ${date}`, `Every routed screen at ${WIDTH}px, by area, one strip per persona. Built from the screenshot matrix; not committed.`, strips)

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

if (process.argv[1]?.endsWith('storyboard-app.ts')) {
  const dir = arg('--dir') ?? 'screenshots'
  const root = join(dir, String(WIDTH))
  if (!existsSync(root)) throw new Error(`no ${root}: run the screens project with SCREENS_WIDTHS=${WIDTH} first (evals/screens/README.md)`)
  const base = arg('--base')
  const listed = arg('--routes')
  const only = listed ? new Set(listed.split(',').filter(Boolean)) : base ? new Set(changedRoutes(diffFiles(base)).routes) : undefined
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).map((f) => f.split('\\').join('/'))
  const strips = appSections(files, only)
  writeFileSync(join(dir, 'storyboard.html'), appStoryboard(strips, new Date().toISOString().slice(0, 10)))
  console.log(`storyboard: ${strips.reduce((n, s) => n + s.frames.length, 0)} screens in ${strips.length} strips → ${join(dir, 'storyboard.html')}`)
}
