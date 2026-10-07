import { describe, it, expect, vi, beforeEach } from 'vitest'

// #450 — a new Page's text is held to the same rule as an edit: no email address.

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent: vi.fn(async () => undefined) }))

import { groupCreate } from './create'
import { ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const FOUNDER = '22222222-2222-2222-2222-222222222222'
const ctx: ActionContext = {
  actingMemberId: FOUNDER,
  viaDelegationId: null,
  traceId: 't',
  db: {} as never,
  now: () => new Date('2026-10-06T12:00:00Z'),
}

beforeEach(() => query.mockReset())

describe('#450 — group.create refuses an email address in Page text', () => {
  it.each(['name', 'businessDisplayName', 'description'] as const)('in %s, before any write', async (field) => {
    const err = await groupCreate(ctx, {
      kind: field === 'businessDisplayName' ? 'business' : 'group',
      founderMemberId: FOUNDER,
      [field]: 'owned by someone@example.com',
    }).catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.message).toBe('Take out the email address. People can reach you through your Page.')
    expect(query).not.toHaveBeenCalled()
  })
})
