// T150 — collects only the unrunnable fixture. Spawned by
// tests/runnable-gate.test.ts; never part of the normal `npm test` run.
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['tests/fixtures/unrunnable.fixture.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '../../src') },
  },
})
