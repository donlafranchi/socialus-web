// Sign-up and sign-in are the same magic-link flow — this route only exists
// so the older /auth/signup links keep working.
import { redirect } from 'next/navigation'
import { safeNext } from '@/lib/safe-next'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const safe = safeNext(next, '')
  redirect(safe ? `/auth/login?next=${encodeURIComponent(safe)}` : '/auth/login')
}
