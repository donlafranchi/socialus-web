import type { ReactNode } from 'react'
import { WaitlistProvider } from '@/components/waitlist/WaitlistProvider'

// #1299 — holds the waitlist journey's answers across its screens; /join itself is unaffected.
export default function JoinLayout({ children }: { children: ReactNode }) {
  return <WaitlistProvider>{children}</WaitlistProvider>
}
