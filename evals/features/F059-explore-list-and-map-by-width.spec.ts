import { test, expect } from '@playwright/test'

// F059 criterion 5 (the PM, 2026-11-25): Explore is a list at every width — no List | Map switch, no Map pill.
// A map appears only as part of an answer (today, a Page's map). Signed out, against the persona seed's metro.
// The PM, 2026-11-01 — one top row (mark, search pill, ➕, You); no bottom bar.

// [guards F059.5 partial: signed out only; a member's ➕ menu is guarded in BrowseSurface.layout.test.tsx]
test.describe('F059 — a list at every width', () => {
  test('on a phone the top row slides away scrolling down and returns scrolling up; no bottom bar, no map', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/explore')
    const header = page.getByTestId('app-header')
    await expect(header.getByTestId('search-pill')).toBeVisible()
    await expect(page.getByTestId('mobile-bar')).toHaveCount(0)
    await expect(page.getByTestId('create-menu')).toHaveCount(0)
    await expect(page.getByTestId('card-grid').getByRole('button', { name: /^(map|list)$/i })).toHaveCount(0)

    // Room to scroll whatever the seed returns: this checks the row, not the list.
    await page.evaluate(() => (document.body.style.minHeight = '3000px'))
    await page.mouse.wheel(0, 600)
    await expect.poll(async () => (await header.boundingBox())?.y ?? 0).toBeLessThan(-40)
    await page.mouse.wheel(0, -200)
    await expect.poll(async () => (await header.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0)
    await expect(page.getByTestId('browse-map')).toHaveCount(0)
  })

  for (const width of [1024, 1440]) {
    test(`at ${width}px the list stands alone, with nothing that opens a map`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/explore')
      // The list pane, not its cards: whether the seed has a visible row at this moment is not what this checks.
      await expect(page.getByTestId('browse-list-pane')).toBeVisible()
      await expect(page.getByTestId('browse-map-pane')).toHaveCount(0)
      await expect(page.getByRole('link', { name: /on (the )?map/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /(show|hide) (the )?map/i })).toHaveCount(0)
      await expect(page.getByRole('tab', { name: 'Map' })).toHaveCount(0)
    })
  }

  test('an old ?view=map link opens the list, not a map', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/explore?view=map')
    await expect(page.getByTestId('browse-list-pane')).toBeVisible()
    await expect(page.getByTestId('browse-map')).toHaveCount(0)
  })
})
