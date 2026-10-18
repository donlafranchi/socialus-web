import { createBrowserClient } from '@supabase/ssr'
import { authCookieOptions, onHttps } from '@/lib/auth/cookie-options'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: authCookieOptions(onHttps()) },
  )
}
