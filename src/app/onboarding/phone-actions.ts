'use server'

// #570 (F081.9) — run before the code is sent: a non-fixed VoIP number is refused.

import { createClient } from '@/lib/supabase-server'
import { phoneIsBlocked } from '@/lib/auth/line-type'

export async function checkPhoneAction(phone: string): Promise<{ ok: true } | { ok: false; reason: 'voip' }> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('You must be signed in.')
  return (await phoneIsBlocked(phone)) ? { ok: false, reason: 'voip' } : { ok: true }
}
