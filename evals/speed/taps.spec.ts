// #527 — tap-speed: how long does every tap take on a mid-range phone on 4G?
// READ-ONLY on production. A mid-range Android (Pixel 7 at 4x CPU slowdown, the
// Lighthouse mobile profile) on a 4G link. Per tap: feedback, URL change, new
// content usable (evals/speed/probe.ts times it inside the page).
//
//   BUILDERS_BASE_URL=https://www.socialus.org BUILDER_SEED=… \
//     npx playwright test --project=tap-speed --workers=1
//
// Signed-in steps need BUILDER_SEED and are skipped without it. Over budget is
// reported; the run FAILS on a stall, a screen that never shows, no feedback,
// or content slower than baseline.json plus 30% (a regression, not the backlog).
import { test, expect, devices, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync, readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { builderEmail, builderPassword } from '../../src/lib/builders/credentials'
import { judge, type Flag, type TapMeasure } from '../../src/lib/speed/judge'
import { verdict, medianOf, type Baseline, type Budgets, type Status } from '../../src/lib/speed/verdict'
import { PROBE } from './probe'
import { STEPS, type Step, type Who } from './steps'

const SEED = process.env.BUILDER_SEED ?? ''
const OUT = process.env.SPEED_OUT ?? 'speed-out'
const BASE = process.env.BUILDERS_BASE_URL ?? 'https://www.socialus.org'
const NET = { latency: Number(process.env.SPEED_RTT_MS ?? 100), down: 9_000_000 / 8, up: 3_000_000 / 8 }
const CPU = Number(process.env.SPEED_CPU ?? 4)
const ONLY = (process.env.SPEED_ONLY ?? '').toLowerCase()
const BASELINE: Baseline = existsSync(join(__dirname, 'baseline.json')) ? JSON.parse(readFileSync(join(__dirname, 'baseline.json'), 'utf8')) : {}
const REGRESSION_BINDS = (existsSync(join(__dirname, 'baseline-source.json')) ? JSON.parse(readFileSync(join(__dirname, 'baseline-source.json'), 'utf8')).source : 'none') === 'ci'
const BUDGETS: Budgets = JSON.parse(readFileSync(join(__dirname, 'budgets.json'), 'utf8'))

interface Req { path: string; type: string; start: number; end: number; status: number; cache: string; id: string }
interface Row extends TapMeasure { mode: 'quick' | 'settled'; longTaskMs: number; requests: number; waterfall: number; slowReqs: string[]; prefetched: boolean | null; finalPath: string; flags: Flag[]; status?: Status; regressed?: boolean; waived?: boolean; note?: string }

test.use({ ...devices['Pixel 7'], baseURL: BASE })
test.skip(!BASE.startsWith('https://'), 'tap-speed measures production: set BUILDERS_BASE_URL')

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: NET.latency, downloadThroughput: NET.down, uploadThroughput: NET.up })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
}

const states: Partial<Record<Who, string>> = {}
async function stateFor(browser: Browser, who: Who): Promise<string | undefined> {
  if (who === 'signedOut') return undefined
  if (states[who]) return states[who]
  const ctx = await browser.newContext({ ...devices['Pixel 7'], baseURL: BASE })
  const page = await ctx.newPage()
  await page.goto('/auth/password')
  await page.getByTestId('email-input').fill(builderEmail(who, process.env.BUILDER_EMAIL_TEMPLATE || undefined))
  await page.getByTestId('submit-button').click()
  await page.getByTestId('password-input').fill(builderPassword(SEED, who))
  await page.getByTestId('submit-button').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 30_000 })
  const path = join(OUT, `.state-${who}.json`)
  mkdirSync(OUT, { recursive: true })
  await ctx.storageState({ path })
  await ctx.close()
  return (states[who] = path)
}

async function resolveFrom(page: Page, from: string): Promise<string> {
  if (!from.startsWith('@')) return from
  const sel = from === '@own-page' ? 'a[href^="/g/"]' : 'a[href^="/g/"]:not([href*="#"])'
  await page.goto(from === '@own-page' ? '/you' : '/explore')
  const href = await page.locator(sel).first().getAttribute('href', { timeout: 15_000 })
  return href ?? '/explore'
}

async function measure(browser: Browser, step: Step, mode: 'quick' | 'settled', fromPath: string): Promise<Row> {
  const ctx: BrowserContext = await browser.newContext({ ...devices['Pixel 7'], baseURL: BASE, storageState: await stateFor(browser, step.who) })
  await ctx.addInitScript(PROBE)
  const page = await ctx.newPage()
  const reqs: Req[] = []
  const born = new Map<string, number>()
  page.on('request', (r) => born.set(r.url() + r.method(), Date.now()))
  page.on('requestfinished', async (r) => {
    const res = await r.response().catch(() => null)
    const u = new URL(r.url())
    if (u.origin !== BASE) return
    const h = res ? await res.allHeaders().catch(() => ({} as Record<string, string>)) : {}
    reqs.push({ path: u.pathname + (u.search.includes('_rsc') ? ' (rsc)' : ''), type: r.resourceType(), start: born.get(r.url() + r.method()) ?? Date.now(), end: Date.now(), status: res?.status() ?? 0, cache: h['x-vercel-cache'] ?? '', id: (h['x-vercel-id'] ?? '').split('::')[0] ?? '' })
  })
  await throttle(page)
  let note: string | undefined
  try {
    if (step.back) {
      await page.goto('/explore', { waitUntil: 'load' })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      await page.locator('a[href^="/g/"]').first().click()
      await page.waitForURL(/\/g\//, { timeout: 20_000 })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    } else {
      await page.goto(fromPath, { waitUntil: 'load' })
    }
    if (mode === 'settled') await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    else await page.waitForTimeout(400)
    if (step.pre) await step.pre(page)
    await page.waitForTimeout(300)
    const spec = { ready: step.ready, notReady: step.notReady ?? [], expectsUrl: step.expectsUrl }
    await page.evaluate((s) => (window as unknown as { __tapArm: (x: unknown) => void }).__tapArm(s), spec)
    const before = Date.now()
    if (step.back) await page.evaluate(() => { (window as unknown as { __tapStart: () => void }).__tapStart(); history.back() })
    else {
      const target = step.tap(page)
      await target.waitFor({ state: 'visible', timeout: 15_000 })
      await target.tap({ timeout: 10_000 })
    }
    // Wait for the page to report ready, or give up after 12 s of phone time.
    const done = await page.waitForFunction(() => (window as unknown as { __tapState: () => { ready: number | null } | null }).__tapState()?.ready != null, null, { timeout: 12_000, polling: 50 }).then(() => true).catch(() => false)
    const st = await page.evaluate(() => (window as unknown as { __tapState: () => { t0: number | null; fb: number | null; url: number | null; ready: number | null; long: number } }).__tapState())
    // A back tap has no pointerdown: its clock starts when the test pressed back.
    const t0 = step.back ? before : st?.t0 ?? before
    const ms = (v: number | null | undefined) => (v == null ? null : Math.max(0, Math.round(v - t0)))
    const relevant = reqs.filter((r) => r.start >= t0 - 50)
    relevant.sort((a, b) => a.start - b.start)
    let layers = 0, edge = 0
    for (const r of relevant) { if (r.start >= edge) layers++; edge = Math.max(edge, r.end) }
    const finalPath = new URL(page.url()).pathname
    const pre = reqs.some((r) => r.start < t0 && r.path.includes('(rsc)') && r.path.startsWith(finalPath))
    const m: TapMeasure = { name: step.name, kind: step.kind, expectsUrl: step.expectsUrl, feedbackMs: step.back ? ms(st?.fb ?? st?.url) : ms(st?.fb), urlMs: ms(st?.url), readyMs: done ? ms(st?.ready) : null }
    const row: Row = { ...m, mode, longTaskMs: Math.round(st?.long ?? 0), requests: relevant.length, waterfall: layers, slowReqs: [...relevant].sort((a, b) => b.end - b.start - (a.end - a.start)).slice(0, 3).map((r) => `${r.path} ${r.end - r.start}ms ${r.cache || '-'} ${r.id}`.trim()), prefetched: step.expectsUrl ? pre : null, finalPath, flags: judge(m), note }
    return row
  } catch (e) {
    note = String(e instanceof Error ? e.message : e).split('\n')[0]!.slice(0, 160)
    const m: TapMeasure = { name: step.name, kind: step.kind, expectsUrl: step.expectsUrl, feedbackMs: null, urlMs: null, readyMs: null }
    return { ...m, mode, longTaskMs: 0, requests: 0, waterfall: 0, slowReqs: [], prefetched: null, finalPath: '', flags: [], note: `could not run: ${note}` }
  } finally {
    await ctx.close()
  }
}

test.setTimeout(180_000)

for (const step of STEPS) {
  if (ONLY && !step.name.toLowerCase().includes(ONLY)) continue
  const modes: ('quick' | 'settled')[] = step.quick ? ['quick', 'settled'] : ['settled']
  for (const mode of modes) {
    test(`${step.name} [${mode}]`, async ({ browser }) => {
      test.skip(step.who !== 'signedOut' && !SEED, 'BUILDER_SEED is not set: signed-in taps are not timed')
      let from = step.from
      if (from.startsWith('@')) {
        const c = await browser.newContext({ ...devices['Pixel 7'], baseURL: BASE, storageState: await stateFor(browser, step.who) })
        const p = await c.newPage()
        from = await resolveFrom(p, from)
        await c.close()
      }
      let row = await measure(browser, step, mode, from)
      let v = verdict({ ...row, mode }, BUDGETS, BASELINE, { regressionBinds: REGRESSION_BINDS })
      // One bad reading is not a finding: a red one is measured twice more and the middle reading is used.
      if (v.status === 'red' && !row.note) {
        const again = [row, await measure(browser, step, mode, from), await measure(browser, step, mode, from)]
        row = { ...row, ...medianOf(again) }
        v = verdict({ ...row, mode }, BUDGETS, BASELINE, { regressionBinds: REGRESSION_BINDS })
      }
      Object.assign(row, { flags: v.flags, status: v.status, regressed: v.regressed, waived: v.waived })
      mkdirSync(OUT, { recursive: true })
      appendFileSync(join(OUT, 'rows.jsonl'), JSON.stringify({ ...row, tag: `${row.name} [${mode}]` }) + '\n')
      test.info().annotations.push({ type: 'tap', description: `${row.name} [${mode}] feedback ${row.feedbackMs}ms url ${row.urlMs}ms content ${row.readyMs}ms ${v.status} ${v.flags.join(',')}` })
      expect(row.note ?? '', 'the tap could not be timed').toBe('')
      expect(v.status, `${row.name} [${mode}] ${JSON.stringify({ feedback: row.feedbackMs, url: row.urlMs, content: row.readyMs, flags: v.flags, slowerThanBaseline: v.regressed })}`).not.toBe('red')
    })
  }
}
