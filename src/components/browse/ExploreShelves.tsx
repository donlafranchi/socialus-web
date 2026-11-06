// F121 — Explore's shelves for the signed-in reader, rendered on the server and streamed in under the first look,
// so the rest of Explore never waits for them. Each is a sideways row with See all (#1154's BrowseShelves).

import { createClient } from '@/lib/supabase-server'
import { loadShelves } from '@/lib/shelves/load'
import type { BrowseScope } from '@/lib/feed/browse-feed'
import { BrowseShelves } from './BrowseShelves'

export async function ExploreShelves({ scope }: { scope: BrowseScope }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const shelves = await loadShelves(supabase, { scope, memberId: data.user?.id ?? null }).catch(() => [])
  if (shelves.length === 0) return null
  return (
    <section data-testid="explore-shelves" aria-label="Shelves" className="px-3 pt-2 md:px-6">
      <BrowseShelves groups={shelves.map((s) => ({ key: `s-${s.id}`, label: s.title, results: s.items, logId: s.logId }))} />
    </section>
  )
}
