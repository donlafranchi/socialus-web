import { test, expect } from '@playwright/test'

// T187 — F059 criterion 5 (restated 2026-10-01): Explore's list and map follow
// the screen width. Signed out, against the persona seed's metro.

// [guards F059.5 partial: the 1024–1439px owner-panel switch, which nothing opens yet]
test.describe('F059 — list and map by width', () => {
  test('under 1024px the pill stays on screen, above the nav, while the cards scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/explore')
    const pill = page.getByTestId('view-pill')
    await expect(pill).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(300)
    const box = await pill.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThan(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(844 - 44)
    await expect(page.getByTestId('card-grid').getByRole('button', { name: /^(map|list)$/i })).toHaveCount(0)

    await pill.click()
    await expect(page.getByTestId('browse-map')).toBeVisible()
    await expect(pill).toHaveText('List')
  })

  test('from 1024px list and map sit side by side and the map stays put', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/explore')
    await expect(page.getByTestId('view-pill')).toHaveCount(0)
    await expect(page.getByTestId('card-grid')).toBeVisible()
    const map = page.getByTestId('browse-map-pane')
    await expect(map).toBeVisible()
    // To the last card, not the page end: past it the footer (#296) rightly
    // carries the split row, map and all, up with it.
    await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="card-grid"]')!
      window.scrollTo(0, grid.getBoundingClientRect().bottom + window.scrollY - window.innerHeight)
    })
    await page.waitForTimeout(300)
    const box = await map.boundingBox()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeLessThan(800)

    await page.getByRole('button', { name: 'Hide map' }).click()
    await expect(map).toHaveCount(0)
    await page.getByRole('button', { name: 'Show map' }).click()
    await expect(page.getByTestId('browse-map-pane')).toBeVisible()
  })
})
