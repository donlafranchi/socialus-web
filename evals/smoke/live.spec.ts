// chore #432 — the live smoke: after what merged today has deployed, open the
// changed screens on production as builder accounts and look. READ-ONLY: it
// signs in and opens and reads pages; it never creates, edits or deletes.
//
//   BUILDERS_BASE_URL=https://www.socialus.org BUILDER_SEED=… SMOKE_ROUTES=page,you
//     npx playwright test --project=smoke-live
//
// Per route / persona / width: the page must load (no 4xx or 5xx), throw no
// uncaught error and log no same-origin console error, and its text must show
// no error page and no email address that is not the viewer's own
// (evals/smoke/checks.ts). A screenshot and the text land in SMOKE_OUT
// (default smoke-out/) for the reader that compares them with the PR's bundle.
// A route with no stable live address (see LIVE_PATHS) is skipped, and the run
// says so rather than passing it.
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { builderEmail, builderPassword } from '../../src/lib/builders/credentials'
import type { PersonaKey } from '../personas'
import { leaks } from './checks'

const SEED = process.env.BUILDER_SEED ?? ''
const TEMPLATE = process.env.BUILDER_EMAIL_TEMPLATE || undefined
const OUT = process.env.SMOKE_OUT ?? 'smoke-out'
const list = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])
const routes = list(process.env.SMOKE_ROUTES)
const personas = (list(process.env.SMOKE_PERSONAS).length ? list(process.env.SMOKE_PERSONAS) : ['signedOut', 'stranger', 'member', 'ownerBusiness', 'operator']) as (PersonaKey | 'signedOut')[]
const widths = (list(process.env.SMOKE_WIDTHS).length ? list(process.env.SMOKE_WIDTHS) : ['390', '1280']).map(Number)

/** Routes with a stable address on production. Page screens use the first Page Explore lists. */
const LIVE_PATHS: Record<string, string | 'first-page'> = {
  root: '/',
  explore: '/explore',
  'explore-map': '/explore',
  following: '/following',
  you: '/you',
  'you-following': '/you/following',
  'you-following-tab': '/you?tab=following',
  'you-saved-tab': '/you?tab=saved',
  'you-settings-tab': '/you?tab=settings',
  page: 'first-page',
  'page-business': 'first-page',
  'auth-login': '/auth/login',
}
/** Only the operator opens these. */
const OPERATOR_ONLY = { 'admin-reports': '/admin/reports' }

test.skip(!SEED || routes.length === 0, 'BUILDER_SEED or SMOKE_ROUTES is not set')

async function signIn(page: Page, persona: PersonaKey) {
  await page.goto('/auth/password')
  await page.getByTestId('email-input').fill(builderEmail(persona, TEMPLATE))
  await page.getByTestId('submit-button').click()
  await page.getByTestId('password-input').fill(builderPassword(SEED, persona))
  await page.getByTestId('submit-button').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 20_000 })
}

for (const who of personas) {
  test.describe(who, () => {
    test.describe.configure({ mode: 'serial' })
    let context: BrowserContext
    let page: Page
    let firstPage = '/explore'
    const own = who === 'signedOut' ? null : builderEmail(who, TEMPLATE)

    test.beforeAll(async ({ browser }) => {
      context = await browser.newContext()
      page = await context.newPage()
      if (who !== 'signedOut') await signIn(page, who)
      await page.goto('/explore', { waitUntil: 'load' })
      const href = await page.locator('a[href^="/g/"]').first().getAttribute('href').catch(() => null)
      if (href) firstPage = href
    })
    test.afterAll(async () => {
      await context?.close()
    })

    for (const name of routes) {
      const path = LIVE_PATHS[name] ?? (who === 'operator' ? (OPERATOR_ONLY as Record<string, string>)[name] : undefined)
      test(name, async () => {
        test.skip(!path, `${name} has no stable address on production for ${who}: not smoked`)
        const target = path === 'first-page' ? firstPage : path!
        const problems: string[] = []
        page.on('pageerror', (e) => problems.push(`uncaught error: ${e.message.slice(0, 160)}`))
        page.on('console', (m) => {
          if (m.type() !== 'error') return
          const t = m.text()
          if (/mapbox|Failed to load resource|favicon|analytics/i.test(t)) return
          problems.push(`console error: ${t.slice(0, 160)}`)
        })
        for (const width of widths) {
          await page.setViewportSize({ width, height: Math.round(width < 744 ? width * 2.16 : width * 0.625) })
          const res = await page.goto(target, { waitUntil: 'load' })
          const status = res?.status() ?? 0
          if (status >= 400) problems.push(`${width}px: HTTP ${status}`)
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
          const text = await page.locator('body').innerText()
          for (const l of leaks(who, text, own)) problems.push(`${width}px: ${l}`)
          const dir = join(OUT, String(width), who)
          mkdirSync(dir, { recursive: true })
          await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true })
          writeFileSync(join(dir, `${name}.txt`), text)
        }
        page.removeAllListeners('pageerror')
        page.removeAllListeners('console')
        expect(problems, `${who} on ${name}`).toEqual([])
      })
    }
  })
}
