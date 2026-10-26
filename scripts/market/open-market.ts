#!/usr/bin/env tsx
// #616 — open a market and send the one "it's open" message, then discard the addresses it went to.
//
//   tsx scripts/market/open-market.ts <market-key>
//
// Needs DATABASE_URL, RESEND_API_KEY and FOLLOW_EMAIL_FROM (the sender the reminders already use). Checks
// them before it changes anything. Safe to run again: it retries unsent addresses.
import { Client } from 'pg'
import { openMarket, type Send } from '../../src/lib/market/open-market'
import { emailReady, sendMemberEmail } from '../../src/lib/notify/email'

async function main() {
  const key = process.argv[2]
  const url = process.env.DATABASE_URL?.trim()
  if (!key) throw new Error('usage: open-market.ts <market-key>')
  if (!url || !emailReady()) throw new Error('set DATABASE_URL, RESEND_API_KEY and FOLLOW_EMAIL_FROM first; nothing was changed')
  const send: Send = async (to, subject, text) => {
    if (!(await sendMemberEmail(to, subject, text))) throw new Error('send failed')
  }
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    console.log(JSON.stringify(await openMarket(db, send, key)))
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
