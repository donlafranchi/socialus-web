'use server'

// #1299 — the waitlist journey's two calls: the zip screen's check, and the finish. Both sit behind the
// waitlist-journey flag, so nobody but builders and the operator reaches them until the PM turns it on.

import { z } from 'zod'
import { createAnonClient } from '@/lib/supabase-anon'
import { resolveAnonymousActionContext } from '@/lib/action-context'
import { metroWaitlistJourneyJoin, ActionError } from '@/actions'
import { flagOn } from '@/lib/flags/check'
import { waitingCountFor } from '@/lib/metro/waitlist-counts'
import { EMAIL_SHAPE, KINDS, PLAN_IDS, ZIP_SHAPE, phoneE164, sideOf } from '@/lib/waitlist/journey'

/** http(s) links only; a bare domain gets https://. Anything else (javascript:, data:, words) is dropped. */
function webLink(raw: string): string {
  const t = (raw ?? '').trim()
  const link = /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(t) ? t : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t) ? `https://${t}` : ''
  return link.length <= 300 ? link : ''
}

export type ZipCheck = { ok: true; market: string } | { ok: false }

export async function checkWaitlistZipAction(zip: string): Promise<ZipCheck> {
  if (!(await flagOn('waitlist-journey')) || !ZIP_SHAPE.test(zip)) return { ok: false }
  const supabase = createAnonClient()
  const keyed = await supabase.rpc('zip_market_key', { p_zip: zip })
  const key = keyed.data as string | null
  if (keyed.error || !key) return { ok: false }
  const named = await supabase.rpc('market_name', { p_key: key })
  const market = named.data as string | null
  return named.error || !market ? { ok: false } : { ok: true, market }
}

export interface WaitlistAnswers {
  plans: string[]
  kinds: string[]
  offerName: string
  offerLink: string
  name: string
  zip: string
  email: string
  phone: string
}

export type JoinResult = { ok: true; market: string; waiting: number | null } | { ok: false; step: 'plans' | 'name' | 'zip' | 'email' | 'phone' | null }

const short = (n: number) => z.string().max(n).catch('')
const ANSWERS = z.object({
  plans: z.array(z.string().max(40)).max(7).catch([]),
  kinds: z.array(z.string().max(40)).max(7).catch([]),
  offerName: short(120),
  offerLink: short(300),
  name: short(60),
  zip: short(5),
  email: short(254),
  phone: short(20),
})

export async function joinWaitlistJourneyAction(input: WaitlistAnswers): Promise<JoinResult> {
  if (!(await flagOn('waitlist-journey'))) return { ok: false, step: null }
  const parsed = ANSWERS.safeParse(input)
  if (!parsed.success) return { ok: false, step: null }
  const a = parsed.data
  const plans = (a.plans ?? []).filter((p) => PLAN_IDS.includes(p))
  if (!plans.length) return { ok: false, step: 'plans' }
  if (!a.name?.trim()) return { ok: false, step: 'name' }
  if (!ZIP_SHAPE.test(a.zip ?? '')) return { ok: false, step: 'zip' }
  if (!EMAIL_SHAPE.test((a.email ?? '').trim())) return { ok: false, step: 'email' }
  if (!phoneE164(a.phone ?? '')) return { ok: false, step: 'phone' }

  const found = sideOf(plans) === 'creator'
  let joined
  try {
    joined = await metroWaitlistJourneyJoin(resolveAnonymousActionContext(), {
      zip: a.zip,
      email: a.email,
      side: sideOf(plans),
      name: a.name.trim(),
      phone: phoneE164(a.phone)!,
      plans,
      offers: found ? (a.kinds ?? []).filter((k) => (KINDS as readonly string[]).includes(k)) : [],
      offerName: found ? (a.offerName ?? '') : '',
      offerLink: found ? webLink(a.offerLink) : '',
    })
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, step: 'zip' }
    throw err
  }
  // The cached figure, the same whether or not this person was already waiting (F076.7, F076.14).
  return { ok: true, market: joined.marketName, waiting: await waitingCountFor(joined.metroId) }
}
