import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { run, after } = vi.hoisted(() => ({ run: vi.fn(async () => undefined), after: vi.fn((fn: () => unknown) => void fn()) }))
vi.mock('next/server', () => ({ after }))
vi.mock('@/actions/_lib/db', () => ({ getPool: () => ({ query: vi.fn() }) }))
vi.mock('./run-assessment', () => ({ runAssessment: run }))

import { assessAfterReport } from './after-report'

const KEY = process.env.ANTHROPIC_API_KEY
beforeEach(() => {
  run.mockClear()
  process.env.ANTHROPIC_API_KEY = 'sk-test'
})
afterEach(() => {
  if (KEY === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = KEY
})

describe('assessAfterReport', () => {
  it('reads the report after the response', () => {
    assessAfterReport('r1')
    expect(after).toHaveBeenCalled()
    expect(run).toHaveBeenCalledWith('r1', expect.anything(), { rebuttal: null })
  })

  it('carries the poster\'s reply when there is one (F100 criterion 1)', () => {
    assessAfterReport('r1', { rebuttal: 'Malicious: He reports everything.' })
    expect(run).toHaveBeenCalledWith('r1', expect.anything(), { rebuttal: 'Malicious: He reports everything.' })
  })

  it('without an API key it does nothing', () => {
    delete process.env.ANTHROPIC_API_KEY
    assessAfterReport('r1')
    expect(run).not.toHaveBeenCalled()
  })
})
