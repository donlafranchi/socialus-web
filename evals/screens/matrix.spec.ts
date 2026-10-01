// #269 — the screenshot matrix: every inventory route, as every persona, at
// every width. Screenshots land in SCREENS_DIR (default ./screenshots), as
// <width>/<persona>/<route>.png, for people and agents to read; CI uploads
// the folder as an artifact.
//
// It fails on a server error (5xx) or an uncaught page error, never on how a
// screen looks: it is a capture, and the review happens on the pictures.
//
// Narrow a local run with SCREENS_PERSONAS, SCREENS_ROUTES and SCREENS_WIDTHS
// (comma-separated keys, names and widths).
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { PERSONAS } from '../personas'
import { ROUTES, WIDTHS } from './routes'

const DIR = process.env.SCREENS_DIR ?? 'screenshots'
const only = (env: string | undefined) => (env ? new Set(env.split(',').map((s) => s.trim())) : null)
const personas = only(process.env.SCREENS_PERSONAS)
const routes = only(process.env.SCREENS_ROUTES)
const widths = only(process.env.SCREENS_WIDTHS)

for (const who of PERSONAS.filter((p) => !personas || personas.has(p.key))) {
  test.describe(who.key, () => {
    test.use({ storageState: who.email ? `evals/.auth/${who.key}.json` : { cookies: [], origins: [] } })

    for (const route of ROUTES.filter((r) => !routes || routes.has(r.name))) {
      test(`${route.name}`, async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(e.message))
        for (const width of WIDTHS.filter((w) => !widths || widths.has(String(w)))) {
          await page.setViewportSize({ width, height: Math.round(width < 744 ? width * 2.16 : width * 0.625) })
          const res = await page.goto(route.path(who), { waitUntil: 'load' })
          expect(res?.status() ?? 0, `${route.name} at ${width}px`).toBeLessThan(500)
          // Bounded: map tiles and polling can keep the network busy forever.
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
          if (route.act) await route.act(page)
          await page.screenshot({ path: join(DIR, String(width), who.key, `${route.name}.png`), fullPage: true })
        }
        expect(errors, `uncaught errors on ${route.name}`).toEqual([])
      })
    }
  })
}
