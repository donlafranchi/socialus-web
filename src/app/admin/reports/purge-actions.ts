'use server'

// #491 — delete a removed photo for good. The operator's OWN session deletes the
// storage object (the media bucket's operator-delete policy), never a
// service-role key. A silently refused delete returns no error, so the deletion
// is VERIFIED by asking for the public URL before anything is recorded; the
// handler records only a deletion that happened. Authorization is in the
// handlers, not here.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { reportPurgeTarget, reportPurge, ActionError } from '@/actions'

export interface PurgeInput {
  groupId: string
  reasonCode: 'illegal_content' | 'person_did_not_agree' | 'not_suitable' | 'other'
  reasonNote?: string
}

function rethrow(err: unknown): never {
  throw err instanceof ActionError ? new Error(err.message) : err
}

export async function purgePhotoAction(input: PurgeInput): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not permitted.')
  const ctx = resolveActionContext({ actingMemberId: data.user.id })

  let objectPath: string
  try {
    objectPath = (await reportPurgeTarget(ctx, { groupId: input.groupId })).objectPath
  } catch (err) {
    rethrow(err)
  }

  const bucket = supabase.storage.from('media')
  const removed = await bucket.remove([objectPath])
  if (removed.error) throw new Error(`Could not delete the photo: ${removed.error.message}`)

  const probe = await fetch(bucket.getPublicUrl(objectPath).data.publicUrl, { method: 'HEAD', cache: 'no-store' })
  if (probe.status !== 404 && probe.status !== 400) {
    throw new Error('The photo is still there, so nothing was recorded. Try again, or check the storage policy.')
  }

  try {
    await reportPurge(ctx, { ...input, objectPath })
  } catch (err) {
    rethrow(err)
  }
  revalidatePath('/admin/reports')
}
