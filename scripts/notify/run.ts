#!/usr/bin/env tsx
// #904 — the notify workflow's entry: `follow` (every 15 minutes), `weekend` (Thursday evening),
// `stats <out.json>` (weekly, for the dashboard), `review <out.md>` (monthly). Needs DATABASE_URL; sends need the VAPID keys.

import { appendFileSync, writeFileSync } from 'node:fs'
import { Client } from 'pg'
import { runFollow, runWeekend, stats } from '../../src/lib/notify/push/sender'
import { summarize } from '../../src/lib/notify/push/review'
import { reviewMarkdown } from '../../src/lib/notify/push/review-report'
import { vapidReady } from '../../src/lib/notify/push/send'
import { runReminders } from '../../src/lib/notify/push/reminder-sender'
import { emailReady } from '../../src/lib/notify/email'
import { COUNT_KINDS } from '../../src/lib/notify/push/rules'

const summary = (line: string) => {
  console.log(line)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n')
}

async function main() {
  const [cmd, out] = process.argv.slice(2)
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is not set')
  if (cmd === 'weekend' && !vapidReady()) {
    summary('VAPID keys are not set: nothing sent.')
    return
  }
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    const now = new Date()
    if (cmd === 'follow') {
      await db.query('begin')
      await db.query(`select 1 from public.notification_cursor where id = 1 for update nowait`)
      if (vapidReady()) {
        const r = await runFollow(db, now)
        summary(`Follow posts: ${r.queued} queued, ${r.sent} members sent, ${r.held} held, ${r.dropped} dropped.`)
      } else summary('VAPID keys are not set: no push.')
      // #945 — reminders ride the same run: push where a member has a device, else email.
      const rm = await runReminders(db, now, vapidReady() ? {} : { push: async () => 'error' })
      await db.query('commit')
      summary(`Reminders: ${rm.due} due, ${rm.pushed} by push, ${rm.emailed} by email, ${rm.undelivered} not delivered${emailReady() ? '' : ' (email is not set up)'}.`)
    } else if (cmd === 'weekend') {
      const r = await runWeekend(db, now)
      summary(`This weekend: ${r.members} opted in and due, ${r.sent} sent, ${r.nothingOn} with nothing on, ${r.later} in quiet hours (next run).`)
    } else if (cmd === 'stats' || cmd === 'review') {
      const rows = await stats(db)
      const kinds = COUNT_KINDS.map((k) => summarize(rows, k))
      const state = kinds.some((k) => k.state === 'red') ? 'red' : kinds.every((k) => k.state === 'quiet') ? 'quiet' : 'green'
      const json = { at: now.toISOString(), state, kinds }
      if (cmd === 'stats') {
        if (out) writeFileSync(out, JSON.stringify(json, null, 1) + '\n')
        summary(`Notifications: ${state}. ` + kinds.map((k) => `${k.kind} ${k.state}${k.why ? ` (${k.why})` : ''}`).join('; '))
      } else {
        const md = reviewMarkdown(json)
        if (out) writeFileSync(out, md)
        summary(md)
      }
    } else {
      throw new Error(`unknown command: ${cmd ?? '(none)'} — follow | weekend | stats <out> | review <out>`)
    }
  } catch (err) {
    await db.query('rollback').catch(() => {})
    throw err
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
