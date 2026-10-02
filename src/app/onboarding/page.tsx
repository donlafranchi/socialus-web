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
  // #205 — onboarding writes no place now; the login carries the mark. A
  // member onboarded before that still has the place it wrote.
  if (home || user.user_metadata?.onboarded === true) redirect('/')

  const { data: member } = await supabase
    .from('members')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle()

  const m = member as { display_name: string } | null

  // T163 (F076) — every US metro, selectable at signup. Ordered by name so the
  // native select's typeahead lands where a person expects.
  const { data: metroRows } = await supabase
    .from('metro_polygons')
    .select('id, name')
    .order('name')

  return (
    <OnboardingFlow
      initialDisplayName={m?.display_name ?? ''}
      metros={(metroRows ?? []) as { id: string; name: string }[]}
    />
  )
}
