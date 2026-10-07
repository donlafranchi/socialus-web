// chore #428 — the review bundle: for the screens a diff can change, as the
// personas worth looking at them as, at 390 and 1280. Reviewers read this
// bundle; nobody starts a browser to review.
//
// Per route / persona / width it writes, under CAPTURE_DIR (default review-bundle/):
//   <width>/<persona>/<route>.png        full page, every <details> group opened
//   <width>/<persona>/<route>.txt        the page text, for the visibility and copy reviews
//   <width>/<persona>/<route>.axe.json   axe-core WCAG 2.1 A/AA violations
//   <width>/<persona>/<route>.meta.json  status and axe violation count (one file per capture, so parallel workers never collide)
//
// Narrow with CAPTURE_ROUTES, CAPTURE_PERSONAS, CAPTURE_WIDTHS (comma-separated).
// Like the screens matrix it fails on a server error or an uncaught page error,
// never on how a screen looks or what axe finds: findings are for the reviewers.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PERSONAS } from '../personas'
import { ROUTES } from './routes'

const DIR = process.env.CAPTURE_DIR ?? 'review-bundle'
const only = (env: string | undefined) => (env ? new Set(env.split(',').map((s) => s.trim()).filter(Boolean)) : null)
const personas = only(process.env.CAPTURE_PERSONAS)
const routes = only(process.env.CAPTURE_ROUTES)
const widths = [...(only(process.env.CAPTURE_WIDTHS) ?? new Set(['390', '1280']))].map(Number)

for (const who of PERSONAS.filter((p) => !personas || personas.has(p.key))) {
  test.describe(who.key, () => {
    test.use({ storageState: who.email ? `evals/.auth/${who.key}.json` : { cookies: [], origins: [] } })

    for (const route of ROUTES.filter((r) => (!routes || routes.has(r.name)) && !(r.same && who.key !== 'signedOut'))) {
      test(route.name, async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(e.message))
        for (const width of widths) {
          await page.setViewportSize({ width, height: Math.round(width < 744 ? width * 2.16 : width * 0.625) })
          const res = await page.goto(route.path(who), { waitUntil: 'load' })
          const status = res?.status() ?? 0
          expect(status, `${route.name} at ${width}px`).toBeLessThan(500)
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
          if (route.act) await route.act(page)
          // Open every collapsed group, so a reviewer sees what a tap would show.
          await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
          const dir = join(DIR, String(width), who.key)
          mkdirSync(dir, { recursive: true })
          await page.screenshot({ path: join(dir, `${route.name}.png`), fullPage: true })
          writeFileSync(join(dir, `${route.name}.txt`), await page.locator('body').innerText())
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze().catch(() => null)
          writeFileSync(
            join(dir, `${route.name}.axe.json`),
            JSON.stringify((axe?.violations ?? []).map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.html?.slice(0, 160) })), null, 2),
          )
          writeFileSync(join(dir, `${route.name}.meta.json`), JSON.stringify({ width, persona: who.key, route: route.name, status, axeViolations: axe?.violations.length ?? -1 }))
        }
        expect(errors, `uncaught errors on ${route.name}`).toEqual([])
      })
    }
  })
}
