// plan #230 (Don, 10-31) — a Page's posts as a timeline anchored at now. Past (ended, or undated past
// its window) runs oldest first so the newest sits nearest now; at now, the latest and anything on
// right now, newest first; coming up, soonest first. A dated post ends at its end, else its start (#814).
type TimelinePost = { id: string; createdAt: string; startsAt: string | null; endsAt?: string | null; current?: boolean }

export function pageTimeline<P extends TimelinePost>(posts: readonly P[], now: Date = new Date()) {
  const at = now.toISOString()
  const ends = (p: P) => (p.endsAt ?? p.startsAt)!
  const past: P[] = []
  const latest: P[] = []
  const upcoming: P[] = []
  for (const p of posts) {
    if (p.startsAt) (p.startsAt > at ? upcoming : ends(p) < at ? past : latest).push(p)
    else (p.current === false ? past : latest).push(p)
  }
  const pastKey = (p: P) => (p.startsAt ? ends(p) : p.createdAt)
  past.sort((a, b) => pastKey(a).localeCompare(pastKey(b)))
  latest.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  upcoming.sort((a, b) => a.startsAt!.localeCompare(b.startsAt!))
  return { past, latest, upcoming }
}
