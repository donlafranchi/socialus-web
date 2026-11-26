import { test, expect } from '@playwright/test'

// F059 criterion 5 (the PM, 2026-11-25): Explore is a list at every width — no List | Map switch, no Map pill.
// A map appears only as part of an answer (today, a Page's map). Signed out, against the persona seed's metro.
// Don, 2026-11-01 — one top row (mark, search pill, ➕, You); no bottom bar.

// [guards F059.5 partial: signed out only; a member's ➕ menu is guarded in BrowseSurface.layout.test.tsx]
// TEMP DEBUG (#1459): print what Explore shows, and any page errors, when a check here fails. Removed before merge.
const pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors.length = 0
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(`console: ${m.text()}`))
})
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return
  const results = await page.getByTestId('browse-results').innerText().catch((e) => `no browse-results: ${e}`)
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')).join(','))
  console.log(`DEBUG ${info.title} @ ${page.url()}\nRESULTS: ${results.slice(0, 600)}\nTESTIDS: ${ids.slice(0, 1500)}\nERRORS: ${pageErrors.join(' | ').slice(0, 1500)}`)
})

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
      await expect(page.getByTestId('card-grid')).toBeVisible()
      await expect(page.getByTestId('browse-map-pane')).toHaveCount(0)
      await expect(page.getByRole('link', { name: /on (the )?map/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /(show|hide) (the )?map/i })).toHaveCount(0)
      await expect(page.getByRole('tab', { name: 'Map' })).toHaveCount(0)
    })
  }

  test('an old ?view=map link opens the list, not a map', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/explore?view=map')
    await expect(page.getByTestId('card-grid')).toBeVisible()
    await expect(page.getByTestId('browse-map')).toHaveCount(0)
  })
})
