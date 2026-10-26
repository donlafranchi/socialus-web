'use server'

// The operator's "is the AI key working" check. Staff who review reports only; the answer is one of four
// words, never the key. It makes one free call (see lib/moderation/key-check).

import { createClient } from '@/lib/supabase-server'
import { getPool } from '@/actions/_lib/db'
import { staffCan } from '@/lib/staff/permissions'
import { checkModerationKey, type KeyStatus } from '@/lib/moderation/key-check'

export async function checkAiKeyAction(): Promise<KeyStatus> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user || !(await staffCan(getPool(), data.user.id, 'reports.review'))) throw new Error('Not permitted.')
  return checkModerationKey()
}
