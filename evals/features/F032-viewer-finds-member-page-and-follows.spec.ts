import { test, expect } from '@playwright/test'
import { signIn } from '../helpers/auth'
import { seedF032Fixture, NADIA, THEO, GHOST, VAULT } from '../fixtures/F032-member-page'

// F032's public member page is retired (#303; Don, 2026-10-01: "You is
// private … You currently isn't visible to anyone else. There is currently no
// public member profile"). What stays true is the privacy floor F032 guarded:
// a member's URL never says whether they exist, to anyone but themself, who
// lands on You.

test.beforeAll(async () => {
  await seedF032Fixture()
})

const NADIA_URL = `/m/${NADIA.handle}`

test.describe('#303 — there is no public member profile', () => {
  test('Given a signed-out visitor | When they open a member’s URL | Then 404', async ({ page }) => {
    const res = await page.goto(NADIA_URL)
    expect(res?.status()).toBe(404)
    await expect(page.getByTestId('member-name')).toHaveCount(0)
  })

  test('Given another signed-in member | When they open it | Then 404, the same as a handle that does not exist', async ({ page }) => {
    await signIn(page, THEO.email, THEO.password)
    expect((await page.goto(NADIA_URL))?.status()).toBe(404)
    expect((await page.goto(`/m/${VAULT.handle}`))?.status()).toBe(404)
    expect((await page.goto('/m/nobody-f032-does-not-exist'))?.status()).toBe(404)
  })

  test('Given a soft-deleted member | When anyone opens the URL | Then 404', async ({ page }) => {
    expect((await page.goto(`/m/${GHOST.handle}`))?.status()).toBe(404)
  })

  test('Given the member themself | When they open their own URL | Then they land on You', async ({ page }) => {
    await signIn(page, NADIA.email, NADIA.password)
    await page.goto(NADIA_URL)
    await expect(page).toHaveURL(/\/you$/)
    await expect(page.getByTestId('you-page')).toBeVisible()
  })

  test('Given a signed-out visitor | When they open You | Then they are asked to sign in, and see nobody’s Pages', async ({ page }) => {
    await page.goto('/you')
    await expect(page.getByTestId('you-signed-out')).toBeVisible()
    await expect(page.getByTestId('your-pages-section')).toHaveCount(0)
  })
})
