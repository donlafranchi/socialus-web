// #616 (F076 criteria 12, 15) — opening a market is a person's act, and it sends the one message
// the waitlist promised, then discards each address it was sent to. Nothing else uses an address.
// Order matters: an address is deleted only after its message went out, so a failed send is
// retried by running this again (it is idempotent on an already-open market).

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export type Send = (to: string, subject: string, text: string) => Promise<void>

export interface OpenResult {
  market: string
  alreadyOpen: boolean
  sent: number
  failed: number
  waitingMembers: number
}

// Words ruled by the PM, 2026-10-11 (socialus-plan F076 § Rulings, 2026-10-25 keeps them for the landing list).
export const openedSubject = (name: string) => `SocialUs is open in ${name}`
export const openedText = (name: string) => `SocialUs is open in ${name}. See what's going on.\n\nhttps://socialus.org/explore`

export async function openMarket(db: Db, send: Send, key: string): Promise<OpenResult> {
  const found = await db.query<{ id: string; name: string; is_open: boolean; metro_id: string | null }>(
    `select id, name, is_open, metro_id from public.markets where slug = $1`,
    [key],
  )
  const market = found.rows[0]
  if (!market) throw new Error(`no market with the key "${key}"`)
  if (!market.metro_id) throw new Error(`market "${key}" has no waitlist to open from`)

  const alreadyOpen = market.is_open
  if (!alreadyOpen) {
    await db.query(`update public.markets set is_open = true, updated_at = now() where id = $1`, [market.id])
    await db.query(`update public.metro_polygons set is_open = true where id = $1`, [market.metro_id])
  }

  const people = await db.query<{ id: string; email: string }>(
    `select id, email from public.metro_waitlist where metro_id = $1 and member_id is null and email is not null`,
    [market.metro_id],
  )
  let sent = 0
  let failed = 0
  for (const row of people.rows) {
    try {
      await send(row.email, openedSubject(market.name), openedText(market.name))
    } catch {
      failed++
      continue
    }
    await db.query(`delete from public.metro_waitlist where id = $1`, [row.id])
    sent++
  }

  // A signed-up member hears in the app; their make-or-find answer is discarded once the market is open (criterion 3).
  const members = await db.query<{ count: string }>(
    `with gone as (delete from public.metro_waitlist where metro_id = $1 and member_id is not null returning 1)
     select count(*)::text as count from gone`,
    [market.metro_id],
  )
  return { market: key, alreadyOpen, sent, failed, waitingMembers: Number(members.rows[0]?.count ?? 0) }
}

export function resendSender(apiKey: string, from: string): Send {
  return async (to, subject, text) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text }),
    })
    if (!res.ok) throw new Error(`send failed: ${res.status}`)
  }
}
