import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })

import { defineConfig, devices } from '@playwright/test'
import { QUARANTINE } from './evals/quarantine'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// #269 — evals that fail against today's rulings; see evals/quarantine.ts.
const QUARANTINED = QUARANTINE.length ? new RegExp(QUARANTINE.map((q) => escape(q.title)).join('|')) : undefined

// #269 — the browser suite runs in CI (ci.yml, "Browser") against a throwaway
// local stack seeded with personas (scripts/seed-personas.ts). Projects:
//   setup          signs each persona in once (evals/screens/personas.setup.ts)
//   mobile-chrome  the feature evals
//   screens        the screenshot matrix, as every persona (needs setup)
//   guard          one spec that MUST fail; CI stops if it passes
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './evals',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    viewport: { width: 390, height: 844 },
  },
  projects: [
    { name: 'setup', testMatch: /screens\/personas\.setup\.ts/ },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testIgnore: [/screens\//, /_guard\//],
      grepInvert: QUARANTINED,
    },
    {
      name: 'screens',
      testMatch: /screens\/matrix\.spec\.ts/,
      dependencies: ['setup'],
      // Six widths per test, each a navigation and a full-page screenshot.
      timeout: 240_000,
      use: { ...devices['Desktop Chrome'] },
    },
    { name: 'guard', testMatch: /_guard\/must-fail\.spec\.ts/, retries: 0 },
  ],
  webServer: {
    // CI serves a production build; locally the dev server is reused.
    command: process.env.PLAYWRIGHT_WEB_COMMAND ?? 'npm run dev',
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    // Override the Next.js dev server's browser-bound public env to the
    // LOCAL Supabase instance during evals. .env.local's NEXT_PUBLIC_*
    // values point at the linked prod project for regular development;
    // without this override, eval seeds write to the local DB but the
    // page's signInWithPassword hits prod, gets "Invalid login
    // credentials," and every spec times out at signIn.
    env: {
      PORT: String(PORT),
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      OPERATOR_MEMBER_ID: process.env.OPERATOR_MEMBER_ID ?? '0a000000-0000-4000-8000-000000000006',
    },
  },
})
