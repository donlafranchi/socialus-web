// #269, [guard-proves-itself]: this spec MUST fail. CI runs it on its own and
// stops if it passes, so a browser suite that has stopped catching anything
// cannot stay green. Never "fix" it.
import { test, expect } from '@playwright/test'

test('the browser suite can fail', async ({ page }) => {
  await page.goto('/explore')
  await expect(page.getByText('This sentence is on no screen in the app.')).toBeVisible({ timeout: 3000 })
})
