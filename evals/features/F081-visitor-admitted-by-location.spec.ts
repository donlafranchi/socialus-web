import { test, expect } from '@playwright/test'

// F081 ruling 2026-11-25 (the PM): a visitor with no market of their own is admitted to the open market within an
// hour of where they are, or told it is not open near them yet. The location is the request's own guess
// (x-vercel-ip-latitude / -longitude), which a test can send. Signed out, against the persona seed (one open market).

test.describe('F081 — a visitor is admitted by where they are', () => {
  test.describe('near the open market', () => {
    test.use({ extraHTTPHeaders: { 'x-vercel-ip-latitude': '38.5449', 'x-vercel-ip-longitude': '-121.7405' } })
    test('sees its results, a line naming it, and Change area', async ({ page }) => {
      await page.goto('/explore')
      await expect(page.getByTestId('browse-admitted')).toContainText('near you')
      await expect(page.getByTestId('browse-results')).toBeVisible()
      await page.getByTestId('browse-admitted').getByRole('button', { name: 'Change area' }).click()
      await expect(page.getByTestId('scope-sheet')).toBeVisible()
    })
  })

  test.describe('far from every open market', () => {
    test.use({ extraHTTPHeaders: { 'x-vercel-ip-latitude': '40.7128', 'x-vercel-ip-longitude': '-74.006' } })
    test('is told SocialUs is not open near them, with no results picked for them', async ({ page }) => {
      await page.goto('/explore')
      await expect(page.getByTestId('feed-not-near')).toBeVisible()
      await expect(page.getByTestId('browse-results')).toHaveCount(0)
    })
  })

  // "or asked as a zip … The zip is stored, with an easy opt-out." CI carries no location, so the zip is asked.
  test('with no location, a zip names their area, is kept on this device, and one tap forgets it', async ({ page }) => {
    await page.goto('/explore')
    const ask = page.getByTestId('browse-zip-ask')
    await ask.getByRole('textbox').fill('95816')
    await ask.getByRole('button', { name: 'Go' }).click()
    await expect(page.getByTestId('browse-zip')).toContainText('from your zip 95816')
    await page.reload()
    await expect(page.getByTestId('browse-zip')).toContainText('from your zip 95816')
    await page.getByRole('button', { name: 'Forget my zip' }).click()
    await expect(page.getByTestId('browse-zip-ask')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('browse-zip')).toHaveCount(0)
  })
})
