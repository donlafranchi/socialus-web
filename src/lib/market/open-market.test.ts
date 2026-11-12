import { describe, it, expect, vi } from 'vitest'
import { openMarket, openedText, type Db } from './open-market'

// [guards F076.15 partial: the send and the discard, against a fake database]
function fakeDb(opts: { isOpen: boolean; emails: string[]; members?: number; town?: string[] }) {
  const waiting = opts.emails.map((email, i) => ({ id: `w${i}`, email }))
  const log: string[] = []
  const db: Db = {
    async query(sql: string, params: unknown[] = []) {
      if (/from public\.markets where slug/.test(sql)) return { rows: params[0] === 'none' ? [] : [{ id: 'm1', name: 'Tahoe', is_open: opts.isOpen, metro_id: 'x1' }] } as never
      if (/update public\.markets/.test(sql) || /update public\.metro_polygons/.test(sql)) { log.push('open'); return { rows: [] } }
      if (/member_id is null/.test(sql)) return { rows: waiting.filter((w) => !log.includes(`del:${w.id}`)) } as never
      if (/delete from public\.metro_waitlist where id/.test(sql)) { log.push(`del:${params[0]}`); return { rows: [] } }
      if (/from auth\.users/.test(sql)) return { rows: (opts.town ?? []).filter((e) => !log.includes(`told:${e}`)).map((email) => ({ id: email, email })) } as never
      if (/insert into public\.town_open_notices/.test(sql)) { log.push(`told:${params[1]}`); return { rows: [] } }
      if (/with gone/.test(sql)) return { rows: [{ count: String(opts.members ?? 0) }] } as never
      throw new Error(`unexpected sql ${sql}`)
    },
  }
  return { db, log }
}

describe('openMarket', () => {
  it('opens the market, sends the ruled words to each address, then discards it', async () => {
    const { db, log } = fakeDb({ isOpen: false, emails: ['a@x.co', 'b@x.co'], members: 3 })
    const send = vi.fn(async () => {})
    const r = await openMarket(db, send, 'tahoe')
    expect(r).toMatchObject({ alreadyOpen: false, sent: 2, failed: 0, waitingMembers: 3 })
    expect(send).toHaveBeenCalledWith('a@x.co', 'SocialUs is open in Tahoe', openedText('Tahoe'))
    expect(log).toEqual(['open', 'open', 'del:w0', 'del:w1'])
  })

  it('keeps an address whose message failed, so running again retries it', async () => {
    const { db, log } = fakeDb({ isOpen: false, emails: ['a@x.co', 'b@x.co'] })
    const send = vi.fn(async (to: string) => { if (to === 'a@x.co') throw new Error('nope') })
    const r = await openMarket(db, send, 'tahoe')
    expect(r).toMatchObject({ sent: 1, failed: 1 })
    expect(log).toEqual(['open', 'open', 'del:w1'])
  })

  it('on an already-open market only retries sends', async () => {
    const { db, log } = fakeDb({ isOpen: true, emails: ['a@x.co'] })
    const r = await openMarket(db, async () => {}, 'tahoe')
    expect(r.alreadyOpen).toBe(true)
    expect(log).toEqual(['del:w0'])
  })

  // F118 criterion 7 — when a town opens, its supporters and makers hear the same ruled words.
  it('on opening, sends the same words to the town’s supporters and makers', async () => {
    const { db } = fakeDb({ isOpen: false, emails: [], town: ['s@x.co', 'm@x.co'] })
    const send = vi.fn(async () => {})
    const r = await openMarket(db, send, 'tahoe')
    expect(r.townSent).toBe(2)
    expect(send).toHaveBeenCalledWith('m@x.co', 'SocialUs is open in Tahoe', openedText('Tahoe'))
  })

  it('tells each town member once, and a re-run retries only a failed send', async () => {
    const { db } = fakeDb({ isOpen: false, emails: [], town: ['s@x.co', 'm@x.co'] })
    const first = vi.fn(async (to: string) => { if (to === 's@x.co') throw new Error('nope') })
    expect(await openMarket(db, first, 'tahoe')).toMatchObject({ townSent: 1, failed: 1 })
    const again = vi.fn(async () => {})
    expect((await openMarket(db, again, 'tahoe')).townSent).toBe(1)
    expect(again).toHaveBeenCalledTimes(1)
    expect(again).toHaveBeenCalledWith('s@x.co', expect.any(String), expect.any(String))
  })

  it('refuses a market that does not exist', async () => {
    await expect(openMarket(fakeDb({ isOpen: false, emails: [] }).db, async () => {}, 'none')).rejects.toThrow(/no market/)
  })
})
