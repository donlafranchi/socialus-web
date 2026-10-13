// #555 — the Page's edit screen answers the tap at once too (it was the creator's slowest tap, URL change at ~2 s).
import { PageSkeleton } from '@/components/group/PageSkeleton'

export default function Loading() {
  return <PageSkeleton />
}
