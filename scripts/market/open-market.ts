#!/usr/bin/env tsx
// #616 — open a market and send the one "it's open" message, then discard the addresses it went to.
//
//   tsx scripts/market/open-market.ts <market-key>
//
// Needs DATABASE_URL, RESEND_API_KEY and MARKET_MAIL_FROM (a sender on a verified domain). Checks all
// three before it changes anything. Safe to run again: it retries unsent addresses.
import { Client } from 'pg'
import { openMarket, resendSender } from '../../src/lib/market/open-market'

async function main() {
  const key = process.argv[2]
  const url = process.env.DATABASE_URL?.trim()
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.MARKET_MAIL_FROM?.trim()
  if (!key) throw new Error('usage: open-market.ts <market-key>')
  if (!url || !apiKey || !from) throw new Error('set DATABASE_URL, RESEND_API_KEY and MARKET_MAIL_FROM first; nothing was changed')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    console.log(JSON.stringify(await openMarket(db, resendSender(apiKey, from), key)))
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
