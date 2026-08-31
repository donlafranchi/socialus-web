import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'
import path from 'path'

// DB-bound suites (currently only tests/rls-coverage.test.ts) read
// process.env.DATABASE_URL, which Vitest does not populate from .env files on
// its own. Load .env.test.local if the developer has created one.
//
// Opt-in by design: without the file, `npm test` behaves exactly as before and
// the DB-bound suite skips. With it, the suite runs against whatever database
// the file names. dotenv does not override already-set variables, so an
// explicitly exported DATABASE_URL (CI, or a one-off remote check) still wins.
//
// The suite is read-only — a single SELECT on pg_tables — so pointing it at a
// remote project is safe. See .env.local.example for the recipe.
dotenv.config({ path: '.env.test.local', quiet: true })

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: [],
    exclude: ['evals/**', 'node_modules/**', '.stryker-tmp/**', 'reports/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
