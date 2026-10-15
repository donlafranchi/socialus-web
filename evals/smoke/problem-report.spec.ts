// #443 — the member bug-report pipeline, end to end on production, run by hand
// (problem-reports-selftest.yml). It is the one smoke that WRITES: it files one report,
// marked TEST, as the builder member; the workflow then files it as a public Issue.
//
//   BUILDERS_BASE_URL=https://www.socialus.org BUILDER_SEED=… npx playwright test --project=problem-report-selftest
import { test, expect, type Page } from '@playwright/test'
import { builderEmail, builderPassword } from '../../src/lib/builders/credentials'

const SEED = process.env.BUILDER_SEED ?? ''
const TEMPLATE = process.env.BUILDER_EMAIL_TEMPLATE || undefined
const TEST_REPORT = 'TEST (pipeline self-test, #443): please ignore. Filed by the problem-reports self-test workflow.'

test.skip(!SEED, 'BUILDER_SEED is not set')
test.describe.configure({ mode: 'serial' })

/** On a phone the link sits at the end of the screen, above the bottom nav. */
async function reachable(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  const link = page.getByTestId('site-footer-phone').getByRole('link', { name: 'Report a problem' })
  await link.scrollIntoViewIfNeeded()
  await expect(link, `${path}: Report a problem on a phone`).toBeVisible()
}

test('signed out, Report a problem is reachable on a phone, and the page asks to sign in', async ({ page }) => {
  for (const path of ['/', '/explore', '/you', '/about']) await reachable(page, path)
  await page.goto('/report')
  await expect(page.getByTestId('report-form')).toHaveCount(0)
})

test('signed in, it is reachable on a phone and a TEST report goes through', async ({ page }) => {
  await page.goto('/auth/password')
  await page.getByTestId('email-input').fill(builderEmail('member', TEMPLATE))
  await page.getByTestId('submit-button').click()
  await page.getByTestId('password-input').fill(builderPassword(SEED, 'member'))
  await page.getByTestId('submit-button').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 20_000 })
  for (const path of ['/explore', '/you']) await reachable(page, path)
  await page.goto('/report?from=%2Fexplore')
  await page.locator('#report-text').fill(TEST_REPORT)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByTestId('report-thanks')).toBeVisible()
})
