'use server'

import { createClient } from '@/lib/supabase-server'

/** The login carries the mark, as `onboarded` does: the welcome shows once per member. */
export async function markWelcomedAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.updateUser({ data: { welcomed: true } })
}
