'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { tagReview, ActionError } from '@/actions'

export async function reviewTagAction(input: { tagId: string; verdict: 'safe' | 'unsafe' }): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not permitted.')
  try {
    await tagReview(resolveActionContext({ actingMemberId: data.user.id }), input)
  } catch (err) {
    throw err instanceof ActionError ? new Error(err.message) : err
  }
  revalidatePath('/admin/tags')
}
