import { createServerClient } from '@supabase/ssr'

/** A cookie-free anonymous client: what a signed-out visitor reads as, safe to use inside a shared cache. */
export function createAnonClient() {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}
