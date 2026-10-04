#!/usr/bin/env tsx
// #280 — builder accounts (Don, 2026-10-01). One per test persona.
//
//   tsx scripts/builders.ts provision         create any missing account, mark it a builder
//   tsx scripts/builders.ts disable <persona> switch one off: ban the login, stamp disabled_at
//   tsx scripts/builders.ts enable <persona>  switch it back on
//   tsx scripts/builders.ts list              persona, member id, email, on/off
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL and BUILDER_SEED.
// Prints member ids and emails, never a password. Production runs it through
// the "Builder accounts" workflow; locally it runs against a local stack.

import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import { BUILDER_PERSONAS, builderEmail, builderPassword } from '../src/lib/builders/credentials'
import type { PersonaKey } from '../evals/personas'
import { getHandler } from '../src/actions'
import { resolveActionContext } from '../src/lib/action-context'

const need = (name: string) => {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is not set`)
  return v
}

const [command, arg] = process.argv.slice(2)
const template = process.env.BUILDER_EMAIL_TEMPLATE || undefined
const supabase = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const db = new Client({ connectionString: need('DATABASE_URL') })

const handleFor = (persona: PersonaKey) => `builder-${persona.toLowerCase()}`

async function memberIdFor(persona: PersonaKey): Promise<string | null> {
  const { rows } = await db.query<{ member_id: string }>(
    `select member_id from public.builders where persona = $1`,
    [persona],
  )
  return rows[0]?.member_id ?? null
}

const memberExists = async (id: string) =>
  (await db.query(`select 1 from public.members where id = $1`, [id])).rows.length > 0

// The signup trigger creates the member row through the app, asynchronously.
// Where the hook is not wired (a local stack), the same handler runs here.
async function ensureMember(id: string, email: string, persona: PersonaKey) {
  for (let i = 0; i < 10; i++) {
    if (await memberExists(id)) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  const handler = getHandler('member.create')!
  try {
    await handler(resolveActionContext({ actingMemberId: 'self-bootstrap' }), {
      authUserId: id,
      email,
      handleSuggestion: handleFor(persona),
      displayName: `Builder · ${persona}`,
    })
  } catch (e) {
    if (!(await memberExists(id))) throw e
  }
}

async function existingUserId(email: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(`select id from auth.users where lower(email) = lower($1)`, [email])
  return rows[0]?.id ?? null
}

async function provision() {
  const seed = need('BUILDER_SEED')
  for (const persona of BUILDER_PERSONAS) {
    if (await memberIdFor(persona)) {
      console.log(`${persona}: already provisioned`)
      continue
    }
    const email = builderEmail(persona, template)
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: builderPassword(seed, persona),
      email_confirm: true,
      app_metadata: { builder: true, persona },
    })
    // A run that stopped after creating the login resumes from it.
    const id = data.user?.id ?? (await existingUserId(email))
    if (!id) throw new Error(`${persona}: ${error?.message ?? 'no user returned'}`)
    await ensureMember(id, email, persona)
    await db.query('begin')
    await db.query(`insert into public.builders (member_id, persona) values ($1, $2)`, [id, persona])
    await db.query(`update public.members set handle = $2, display_name = $3 where id = $1`, [
      id,
      handleFor(persona),
      `Builder · ${persona}`,
    ])
    await db.query('commit')
    console.log(`${persona}: ${id} ${email}`)
  }
}

async function setEnabled(persona: PersonaKey, enabled: boolean) {
  const id = await memberIdFor(persona)
  if (!id) throw new Error(`${persona} is not a provisioned builder`)
  const { error } = await supabase.auth.admin.updateUserById(id, { ban_duration: enabled ? 'none' : '876000h' })
  if (error) throw new Error(`${persona}: ${error.message}`)
  await db.query(`update public.builders set disabled_at = $2 where member_id = $1`, [id, enabled ? null : new Date()])
  console.log(`${persona}: ${enabled ? 'enabled' : 'disabled'}`)
}

async function list() {
  const { rows } = await db.query<{ persona: string; member_id: string; disabled_at: Date | null }>(
    `select persona, member_id, disabled_at from public.builders order by persona`,
  )
  for (const r of rows) {
    console.log(`${r.persona}: ${r.member_id} ${builderEmail(r.persona as PersonaKey, template)} ${r.disabled_at ? 'OFF' : 'on'}`)
  }
}

async function main() {
  await db.connect()
  try {
    if (command === 'provision') return await provision()
    if (command === 'list') return await list()
    if ((command === 'disable' || command === 'enable') && BUILDER_PERSONAS.includes(arg as PersonaKey)) {
      return await setEnabled(arg as PersonaKey, command === 'enable')
    }
    throw new Error(`usage: builders.ts provision | list | disable <persona> | enable <persona>\npersonas: ${BUILDER_PERSONAS.join(', ')}`)
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
