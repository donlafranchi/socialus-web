import { test, expect } from '@playwright/test'
import { COUNT, TAG, decidedCount, seedReportQueue } from '../fixtures/F101-report-queue'
import { PERSONA_PASSWORD, persona } from '../personas'
import { signIn } from '../helpers/auth'

// F101 criterion 15: 50 waiting rows are clearable in under 10 minutes on a
// phone, measured at 375px. One tap each, then wait until every decision has
// reached the database (the last one waits out its five-second Undo window).
const BUDGET_MS = Number(process.env.F101_BUDGET_MS ?? 10 * 60_000)

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })
test.setTimeout(15 * 60_000)

test.beforeAll(async () => {
  test.setTimeout(120_000)
  await seedReportQueue()
})

// [guards F101.15]
test('F101 — the operator decides 50 flagged Posts, one tap each, inside the budget', async ({ page }) => {
  await signIn(page, persona('operator').email!, PERSONA_PASSWORD)
  await page.goto('/admin/reports')
  const mine = page.getByTestId('review-row').filter({ hasText: TAG })
  await expect(mine).toHaveCount(COUNT)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

  const started = Date.now()
  for (let n = 0; n < COUNT; n++) {
    const row = mine.first()
    await row.getByTestId(n % 2 ? 'review-approve' : 'review-remove').tap()
    await expect(mine).toHaveCount(COUNT - n - 1)
  }
  await expect.poll(decidedCount, { timeout: 30_000 }).toBe(COUNT)
  const elapsed = Date.now() - started

  console.log(`F101.15: ${COUNT} decisions in ${(elapsed / 1000).toFixed(1)}s (budget ${BUDGET_MS / 1000}s)`)
  expect(elapsed).toBeLessThan(BUDGET_MS)
})
