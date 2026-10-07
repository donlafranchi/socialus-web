// #388 — only the operator can flip the switch or delete builder content.

import { describe, it, expect } from 'vitest'
import { builderContentSetVisible, builderContentDeleteAll } from './content'
import { resolveActionContext } from '@/lib/action-context'

const member = resolveActionContext({ actingMemberId: '11111111-1111-4111-8111-111111111111' })

describe('builder content handlers', () => {
  it('refuse anyone but the operator', async () => {
    await expect(builderContentSetVisible(member, { visible: false })).rejects.toThrow(/not permitted/)
    await expect(builderContentDeleteAll(member, { confirm: 'DELETE' })).rejects.toThrow(/not permitted/)
  })

  it('delete needs the word DELETE', async () => {
    await expect(builderContentDeleteAll(member, { confirm: 'yes' })).rejects.toThrow(/Invalid input/)
  })
})
