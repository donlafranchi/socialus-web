// chore #432 — [guard-proves-itself] for the live smoke: this asserts that a
// route which does not exist loads. It must FAIL, every run, before the smoke
// is believed (the workflow fails if it passes).
import { test, expect } from '@playwright/test'

test('a route that does not exist loads (must fail)', async ({ page }) => {
  const res = await page.goto('/no-such-route-live-smoke-guard')
  expect(res?.status()).toBe(200)
})
