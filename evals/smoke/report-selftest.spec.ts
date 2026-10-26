// #486 — the report flow and the AI first read, end to end on production, run by hand
// (report-selftest.yml). It WRITES: the builder member reports one builder Page through
// the real sheet, marked TEST. A builder's report is stored and queued but never read by
// the model and never sends a notice (run-assessment.ts, create.ts), so what this proves
// is the wiring: the report lands and the post-commit read fires (a skipped row appears).
//
//   BUILDERS_BASE_URL=https://www.socialus.org BUILDER_SEED=… REPORT_PAGE_ID=… npx playwright test --project=report-selftest
import { test, expect } from '@playwright/test'
import { builderEmail, builderPassword } from '../../src/lib/builders/credentials'

const SEED = process.env.BUILDER_SEED ?? ''
const TEMPLATE = process.env.BUILDER_EMAIL_TEMPLATE || undefined
const PAGE_ID = process.env.REPORT_PAGE_ID ?? ''
export const TEST_REPORT = 'TEST (report self-test, #486): please ignore. Filed by the report-selftest workflow.'

test.skip(!SEED || !PAGE_ID, 'BUILDER_SEED and REPORT_PAGE_ID are required')

test('the builder member reports one builder Page with a TEST reason', async ({ page }) => {
  await page.goto('/auth/password')
  await page.getByTestId('email-input').fill(builderEmail('member', TEMPLATE))
  await page.getByTestId('submit-button').click()
  await page.getByTestId('password-input').fill(builderPassword(SEED, 'member'))
  await page.getByTestId('submit-button').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 20_000 })
  await page.goto(`/g/${PAGE_ID}`)
  await page.getByRole('button', { name: 'More options' }).first().click()
  await page.getByRole('menuitem', { name: 'Report this Page', exact: true }).click()
  await page.getByRole('radio', { name: 'Spam' }).check()
  await page.locator('textarea').fill(TEST_REPORT)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('status')).toBeVisible({ timeout: 20_000 })
})
