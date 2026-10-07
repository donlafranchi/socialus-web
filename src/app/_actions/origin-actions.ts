'use server'

// F102 criterion 13 — where a post or an upload came from. Best-effort: it never
// throws, because failing to record must not undo what the member just did.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { originRecord } from '@/actions'
import { requestIp } from '@/lib/request-ip'

export async function recordOrigin(memberId: string, kind: 'post' | 'upload', ref: string): Promise<void> {
  try {
    await originRecord(resolveActionContext({ actingMemberId: memberId }), { kind, ref, ip: await requestIp() })
  } catch (err) {
    console.error('[origin] not recorded:', err instanceof Error ? err.message : err)
  }
}

export async function recordUploadAction(input: { url: string }): Promise<void> {
  const { data } = await (await createClient()).auth.getUser()
  if (!data.user) return
  await recordOrigin(data.user.id, 'upload', input.url)
}
