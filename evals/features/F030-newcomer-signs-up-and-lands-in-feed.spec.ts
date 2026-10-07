import { test, expect } from '@playwright/test'
import { signUpWithPassword, signInViaEmailFirst } from '../helpers/auth'
import {
  seedF030Fixture,
  NADIA,
  OAK_PARK_F030,
  BARREN_F030,
  PRODUCT,
  GATHERING,
  type SeededF030Fixture,
} from '../fixtures/F030-newcomer'

// F030: A newcomer signs up and lands in the awareness feed.
// Source: planning/now/scenario-F030-newcomer-signs-up-and-lands-in-feed.md
//
// One test per acceptance criterion:
//   1. Anonymous visitor sees a locality-defaulted feed + "Make this yours" CTA.
//   2. Signup (email/password, new user) → profile → locality → interests.
//   3. Feed re-renders against the chosen scope.
//   4. Empty-state widen-locality when no Items match.
//
// Auth-method note (b1): the public flow is magic-link only (/auth/login),
// which can't be exercised headless — a link can't be clicked. These tests
// drive /auth/password, the unlinked password route kept for evals. Local dev
// auto-confirms (config.toml enable_confirmations=false) so signUp yields a
// live session.

let SEEDED: SeededF030Fixture
test.beforeAll(async () => {
  SEEDED = await seedF030Fixture()
})
void (() => SEEDED)

test.describe('F030 — A newcomer signs up and lands in the feed', () => {
  test.describe('AC1 — Anonymous visitor sees a locality-defaulted feed', () => {
    test('Given an anonymous visitor opens / scoped to the seeded locality | When the page loads | Then the feed shows nearby Items with a "Make this yours" CTA and a scope picker', async ({
      page,
    }) => {
      const res = await page.goto(`/?place=${OAK_PARK_F030.slug}`)
      expect(res?.status()).toBe(200)

      // The locality feed renders, anon.
      await expect(page.getByTestId('locality-feed')).toBeVisible()
      // "Make this yours" signup CTA above the feed (anon only).
      await expect(page.getByTestId('signup-cta')).toBeVisible()
      // Inline scope picker to change locality before signing up.
      await expect(page.getByTestId('scope-picker')).toBeVisible()
      // Nearby Items appear.
      const cards = page.getByTestId('feed-item-card')
      await expect(cards.first()).toBeVisible()
      await expect(page.getByText(PRODUCT.title)).toBeVisible()
      await expect(page.getByText(GATHERING.title)).toBeVisible()
    })
  })

  test.describe('AC4 — Empty-state widen-locality when nothing matches', () => {
    test('Given a locality with no Items | When the visitor lands there | Then a friendly empty-state offers a one-tap widen-the-locality affordance', async ({
      page,
    }) => {
      await page.goto(`/?place=${BARREN_F030.slug}`)
      await expect(page.getByTestId('feed-empty-state')).toBeVisible()
      await expect(page.getByTestId('widen-locality')).toBeVisible()
    })
  })

  test.describe('AC2 + AC3 — Email/password signup → onboarding → feed', () => {
    test('Given a new visitor signs up with email + password | When they set a display name | Then onboarding completes and they land on the feed', async ({
      page,
    }) => {
      // A genuinely new email → the signup page routes to "set a password",
      // creates the account, and (local auto-confirm) lands us on /onboarding.
      const email = `newcomer+${Date.now()}@example.test`
      await signUpWithPassword(page, email, 'F030-newcomer-pass')
      await page.waitForURL((url) => url.pathname === '/onboarding')

      // #222 (F081): one screen — legal name, display name, zip, the 18+ box. No
      // handle / locality / interests steps, and nobody picks a metro: the zip does.
      await expect(page.getByTestId('onboarding-name')).toBeVisible()
      await expect(page.getByTestId('onboarding-handle')).toHaveCount(0)
      await expect(page.getByTestId('onboarding-locality')).toHaveCount(0)
      await expect(page.getByTestId('onboarding-interests')).toHaveCount(0)
      await page.getByTestId('onboarding-legal-name').fill('New Comer Smith')
      await page.getByTestId('onboarding-name').fill('New Comer')
      await page.getByTestId('onboarding-zip').fill('95819')
      await page.getByTestId('onboarding-adult').check()
      await page.getByTestId('onboarding-continue').click()
      // The screen shows which metro the zip decided.
      await expect(page.getByTestId('onboarding-metro')).toContainText('Sacramento')
      await page.getByTestId('onboarding-metro-continue').click()

      // Lands on / — the feed renders against the defaulted primary_home.
      await page.waitForURL((url) => url.pathname === '/')
      await expect(page.getByTestId('locality-feed')).toBeVisible()
      // The signup CTA is gone now they're authenticated.
      await expect(page.getByTestId('signup-cta')).toHaveCount(0)

      // Idempotent re-entry: now onboarded, revisiting /onboarding → /.
      await page.goto('/onboarding')
      await page.waitForURL((url) => url.pathname === '/')
      await expect(page.getByTestId('locality-feed')).toBeVisible()
    })

    test('Given a returning member enters their email | When the page detects the account | Then it shows "enter password" and signs them in', async ({
      page,
    }) => {
      // NADIA is seeded (a registered auth user) → the email-first page must
      // detect her and show the enter-password (returning) phase, then log in.
      await signInViaEmailFirst(page, NADIA.email, NADIA.password)
      // Signed in. NADIA has no primary_home → routed to onboarding (next=/onboarding).
      await expect(page).toHaveURL(/\/onboarding|\/$/)
    })
  })
})
