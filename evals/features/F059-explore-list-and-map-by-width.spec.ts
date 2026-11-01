import { test, expect } from '@playwright/test'

// T187 — F059 criterion 5 (restated 2026-10-01): Explore's list and map follow
// the screen width. Signed out, against the persona seed's metro.
// Don, 2026-11-01 — one top row (mark, search pill, ➕, You); no bottom bar; signed out, no ➕ and so no Map.

// [guards F059.5 partial: the 1024–1439px owner-panel switch, which nothing opens yet]
test.describe('F059 — list and map by width', () => {
  test('on a phone the top row slides away scrolling down and returns scrolling up; no bottom bar, no Map', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/explore')
    const header = page.getByTestId('app-header')
    await expect(header.getByTestId('search-pill')).toBeVisible()
    await expect(page.getByTestId('mobile-bar')).toHaveCount(0)
    await expect(page.getByTestId('create-menu')).toHaveCount(0)
    await expect(page.getByTestId('card-grid').getByRole('button', { name: /^(map|list)$/i })).toHaveCount(0)

    await page.mouse.wheel(0, 600)
    await expect.poll(async () => (await header.boundingBox())?.y ?? 0).toBeLessThan(-40)
    await page.mouse.wheel(0, -200)
    await expect.poll(async () => (await header.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0)
    await expect(page.getByTestId('browse-map')).toHaveCount(0)
  })

  test('from 1024px a signed-out visitor still gets the list only, with no Map control', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/explore')
    await expect(page.getByTestId('card-grid')).toBeVisible()
    await expect(page.getByTestId('browse-map-pane')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Hide map' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Map' })).toHaveCount(0)
  })
})
