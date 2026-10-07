// #407 — set or change the password that works alongside the emailed link. A
// reset link from sign-in lands here already signed in.

import { createClient } from '@/lib/supabase-server'
import { AuthCard } from '@/components/shell/AuthCard'
import { Button } from '@/components/ui/Button'
import { PasswordForm } from '@/components/auth/PasswordForm'

export const dynamic = 'force-dynamic'

export default async function YouPasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <AuthCard testId="you-password">
      {user ? (
        <PasswordForm email={user.email ?? ''} />
      ) : (
        <>
          <h1 className="text-title-1 text-[var(--color-fg)]">Password</h1>
          <p className="mt-2 text-body-sm text-[var(--color-fg-muted)]">Sign in to set your password.</p>
          <Button href="/auth/login?next=/you/password" className="mt-5 w-full">
            Sign in
          </Button>
        </>
      )}
    </AuthCard>
  )
}
