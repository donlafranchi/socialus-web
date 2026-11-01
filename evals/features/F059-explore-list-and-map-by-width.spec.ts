import { test, expect } from '@playwright/test'

// T187 — F059 criterion 5 (restated 2026-10-01): Explore's list and map follow
// the screen width. Signed out, against the persona seed's metro.

// [guards F059.5 partial: the 1024–1439px owner-panel switch, which nothing opens yet]
test.describe('F059 — list and map by width', () => {
  // #334 (ruling 2026-10-01): signed out is list only at every width; the Map control opens sign-up.
  test('on a phone the bar stays on screen, clear of the bottom edge, and its menu\'s Map opens sign-up', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/explore')
    const bar = page.getByTestId('mobile-bar')
    await expect(bar).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(300)
    const box = await bar.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(844)
    await expect(page.getByTestId('card-grid').getByRole('button', { name: /^(map|list)$/i })).toHaveCount(0)

    await page.getByTestId('bar-more').click()
    await page.getByTestId('bar-menu-view').click()
    await expect(page.getByTestId('sign-in-prompt')).toBeVisible()
    await expect(page.getByTestId('browse-map')).toHaveCount(0)
  })

  test('from 1024px a signed-out visitor still gets the list only, with Map opening sign-up', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/explore')
    await expect(page.getByTestId('card-grid')).toBeVisible()
    await expect(page.getByTestId('browse-map-pane')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Hide map' })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Map' }).click()
    await expect(page.getByTestId('sign-in-prompt-continue')).toHaveAttribute('href', /\/auth\/login/)
  })
})
