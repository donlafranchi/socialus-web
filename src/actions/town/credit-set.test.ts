import { describe, it, expect, vi } from 'vitest'

const { query, appendEvent } = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [] })), appendEvent: vi.fn(async () => undefined) }))
vi.mock('../_lib/db', () => ({ withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })) }))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { townCreditSet } from './credit-set'
import type { ActionContext } from '../_lib/context'

const ctx = (): ActionContext => ({ actingMemberId: 'm-1', viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date('2026-10-26T12:00:00Z') })

describe('town.credit_set — F118 criterion 2', () => {
  it('hides only the acting member’s own name', async () => {
    await expect(townCreditSet(ctx(), { hidden: true })).resolves.toEqual({ hidden: true })
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toMatch(/update public\.members set open_credit_hidden/)
    expect(params.slice(0, 2)).toEqual(['m-1', true])
    expect(appendEvent).toHaveBeenCalledOnce()
  })
})
