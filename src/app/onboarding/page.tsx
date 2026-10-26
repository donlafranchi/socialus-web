// T089 — Post-auth onboarding page (F030).
// Gate: unauthenticated → signup; already-onboarded (active primary_home) → /.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/onboarding')

  // Idempotent re-entry: a Member who already has a home locality is done.
  const { data: home } = await supabase
    .from('member_place_interests')
    .select('place_id')
    .eq('member_id', user.id)
    .eq('scope_kind', 'primary_home')
    .is('removed_at', null)
    .maybeSingle()
  // F081 — a phone verified by text code, unless the login is a builder (#280).
  // Off until PHONE_VERIFICATION_REQUIRED, which waits on the SMS provider.
  const phoneVerified =
    process.env.PHONE_VERIFICATION_REQUIRED !== '1' ||
    Boolean(user.phone_confirmed_at) ||
    user.app_metadata?.builder === true
  // #205 — onboarding writes no place now; the login carries the mark. A
  // member onboarded before that still has the place it wrote.
  const { data: member } = await supabase
    .from('members')
    .select('display_name, legal_name')
    .eq('id', user.id)
    .maybeSingle()

  const m = member as { display_name: string; legal_name: string | null } | null
  // F077.1 — a member who never gave a legal name stays here until they do.
  const named = Boolean(m?.legal_name?.trim()) || user.app_metadata?.builder === true
  if ((home || user.user_metadata?.onboarded === true) && phoneVerified && named) redirect('/')

  return (
    <OnboardingFlow
      initialDisplayName={m?.display_name ?? ''}
      phoneVerified={phoneVerified}
    />
  )
}
