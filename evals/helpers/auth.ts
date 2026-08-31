import { Page } from '@playwright/test'

/**
 * Eval sign-in.
 *
 * The public flow is magic-link only (/auth/login) and evals can't read an
 * inbox, so these helpers drive /auth/password — the unlinked password route
 * kept for exactly this purpose. Delete it (and rewrite these) once evals
 * establish sessions programmatically.
 */
export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/auth/password')
  await page.locator('[data-testid="email-input"]').fill(email)
  await page.locator('[data-testid="submit-button"]').click()
  await page.locator('[data-testid="enter-password-heading"]').waitFor({ state: 'visible' })
  await page.locator('[data-testid="password-input"]').fill(password)

  // Local GoTrue intermittently returns "Database error querying schema" when a
  // password grant races other DB load (parallel-worker seeds + concurrent
  // logins). The token grant itself is healthy (verified via direct /token), so
  // the submit is idempotent — re-submitting on a non-navigation succeeds.
  const navigated = (url: URL) => !url.pathname.startsWith('/auth/')
  let lastErr: unknown
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.locator('[data-testid="submit-button"]').click()
    try {
      await page.waitForURL(navigated, { timeout: 8000 })
      return
    } catch (err) {
      lastErr = err
      await page.waitForTimeout(500)
    }
  }
  throw lastErr
}

/**
 * NEW user: enter email → "set a password" → create account. Local dev
 * auto-confirms (config.toml enable_confirmations=false), so signUp yields a
 * live session and the page redirects to `next`.
 */
export async function signUpWithPassword(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto('/auth/password')
  await page.locator('[data-testid="email-input"]').fill(email)
  await page.locator('[data-testid="submit-button"]').click()
  await page.locator('[data-testid="set-password-heading"]').waitFor({ state: 'visible' })
  await page.locator('[data-testid="password-input"]').fill(password)
  await page.locator('[data-testid="submit-button"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 10000 })
}

/**
 * RETURNING user: asserts the returning-user phase appears (proving email
 * detection) before submitting.
 */
export async function signInViaEmailFirst(
  page: Page,
  email: string,
  password: string,
) {
  await signIn(page, email, password)
}
