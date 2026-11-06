// #1183 — a member post's lead line.
import { describe, it, expect } from 'vitest'
import { memberPostLead } from './lead'

const now = new Date('2026-11-05T20:00:00Z')

describe('#1183 — memberPostLead', () => {
  it('kind, how long ago in the metro’s days, and the neighborhood', () => {
    expect(memberPostLead({ kind: 'lost_found', createdAt: '2026-11-03T18:00:00Z', saleOn: null, placeName: 'Curtis Park' }, now)).toBe('Lost & found · 2 days ago · Curtis Park')
    expect(memberPostLead({ kind: 'ask', createdAt: '2026-11-05T16:00:00Z', saleOn: null, placeName: 'Midtown' }, now)).toBe('Ask a neighbor · Today · Midtown')
    expect(memberPostLead({ kind: 'ask', createdAt: '2026-11-04T16:00:00Z', saleOn: null, placeName: 'Midtown' }, now)).toBe('Ask a neighbor · Yesterday · Midtown')
  })

  it('a yard sale gives its day instead', () => {
    expect(memberPostLead({ kind: 'free_sale', createdAt: '2026-11-04T16:00:00Z', saleOn: '2026-11-07', placeName: 'Land Park' }, now)).toBe('Free / for sale · Sat, Nov 7 · Land Park')
  })
})
