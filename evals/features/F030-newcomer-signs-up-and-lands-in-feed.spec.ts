import { test, expect } from '@playwright/test'
import { signInViaEmailFirst } from '../helpers/auth'
import { seedF030Fixture, NADIA, type SeededF030Fixture } from '../fixtures/F030-newcomer'

// F030: A newcomer signs up and lands in the awareness feed.
// Source: planning/now/scenario-F030-newcomer-signs-up-and-lands-in-feed.md
//
// The anonymous locality feed, its empty state and the sign-up-lands-on-the-feed test were retired with the old home
// feed (#1302, #1363); they had been quarantined since the feed left. F030 AC1 is to be restated in socialus-plan.
// What stays: a returning member is recognised by email and signs in.
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
  test.describe('Sign-in — a returning member', () => {
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
