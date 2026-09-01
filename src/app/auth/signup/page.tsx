// Sign-up and sign-in are the same magic-link flow — this route only exists
// so the older /auth/login links keep working.
import { redirect } from 'next/navigation'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const safe = next && next.startsWith('/') ? next : null
  redirect(safe ? `/auth/login?next=${encodeURIComponent(safe)}` : '/auth/login')
}
