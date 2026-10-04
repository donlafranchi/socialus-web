import { describe, it, expect } from 'vitest'
import { isBuilderOperator, isOperator, operatorMemberId } from './operator'

const OP = '11111111-1111-1111-1111-111111111111'

describe('operator identity fails closed', () => {
  it('authorises nobody when the variable is unset', () => {
    expect(operatorMemberId({})).toBeNull()
    expect(isOperator(OP, {})).toBe(false)
  })

  it('treats blank and whitespace as unset, not as a match', () => {
    for (const v of ['', '   ']) {
      const env = { OPERATOR_MEMBER_ID: v }
      expect(operatorMemberId(env)).toBeNull()
      expect(isOperator(v, env)).toBe(false)
    }
  })

  it('matches only the configured member', () => {
    const env = { OPERATOR_MEMBER_ID: OP }
    expect(isOperator(OP, env)).toBe(true)
    expect(isOperator('22222222-2222-2222-2222-222222222222', env)).toBe(false)
  })

  it('never treats an absent or bootstrap actor as the operator', () => {
    const env = { OPERATOR_MEMBER_ID: OP }
    expect(isOperator(null, env)).toBe(false)
    expect(isOperator(undefined, env)).toBe(false)
    expect(isOperator('self-bootstrap', env)).toBe(false)
  })

  it('ignores surrounding whitespace in the configured value', () => {
    expect(isOperator(OP, { OPERATOR_MEMBER_ID: ` ${OP} ` })).toBe(true)
  })
})

describe('#280 — the builder operator persona', () => {
  const BUILDER_OP = '33333333-3333-3333-3333-333333333333'
  it('is an operator when named by BUILDER_OPERATOR_MEMBER_ID', () => {
    const env = { OPERATOR_MEMBER_ID: OP, BUILDER_OPERATOR_MEMBER_ID: BUILDER_OP }
    expect(isOperator(BUILDER_OP, env)).toBe(true)
    expect(isOperator(OP, env)).toBe(true)
  })
  it('stands alone: no real operator configured still admits the builder one', () => {
    expect(isOperator(BUILDER_OP, { BUILDER_OPERATOR_MEMBER_ID: BUILDER_OP })).toBe(true)
    expect(isOperator(OP, { BUILDER_OPERATOR_MEMBER_ID: BUILDER_OP })).toBe(false)
  })
  it('names the builder operator, so the queue can show it builder reports', () => {
    expect(isBuilderOperator(BUILDER_OP, { BUILDER_OPERATOR_MEMBER_ID: BUILDER_OP })).toBe(true)
    expect(isBuilderOperator(OP, { OPERATOR_MEMBER_ID: OP })).toBe(false)
  })
})
