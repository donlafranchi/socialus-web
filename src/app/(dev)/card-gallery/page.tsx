// Verification surface for the card system. Dev-only — the (dev) layout calls
// notFound() outside development, so this never ships.
//
// It exists to be looked at at 320px and at 2560px. Everything on it is
// placeholder.

import { CardGrid, TileCard, AnnouncementCard, StatusDot, MetricTile } from '@/components/cards'

const TILES = [
  { title: 'Clara’s Kitchen', tagline: 'Sourdough, focaccia, and a weekly cinnamon thing.', meta: 'Oak Park · Sun', emoji: '🍞' },
  { title: 'Held Ceramics', tagline: 'Hand-thrown mugs and small plates.', meta: 'Midtown · Sat', emoji: '🏺' },
  { title: 'Two Rivers Honey', tagline: null, meta: null, emoji: '🍯' },
  { title: 'Sierra Bench Works', tagline: 'Benches, stools, and repairs to furniture you already own.', meta: null, emoji: '🪵' },
  { title: 'Thread & Thrift', tagline: 'Mending, alterations, and a Tuesday sewing table.', meta: 'Tahoe Park · Tue', emoji: '🧵' },
  { title: 'Valley Apiary', tagline: 'Raw honey and beeswax from eight hives along the river.', meta: null, emoji: '🐝' },
]

export default function CardGalleryPage() {
  return (
    <main className="px-4 py-6 bg-[var(--color-bg)] min-h-screen">
      <h1 className="text-2xl font-semibold text-[var(--color-fg)]">Card system</h1>
      <p className="text-sm text-[var(--color-fg-muted)] mt-1">
        Resize the window. No breakpoints — one grid rule from 320px to 2560px.
      </p>

      <h2 className="text-[17px] font-semibold mt-8 text-[var(--color-fg)]">Tiles</h2>
      <CardGrid className="mt-3">
        {TILES.map((t) => (
          <TileCard
            key={t.title}
            {...t}
            href="/#"
            action={<button type="button" className="chip w-full justify-center">Follow</button>}
          />
        ))}
      </CardGrid>

      <h2 className="text-[17px] font-semibold mt-10 text-[var(--color-fg)]">Tiles, compact</h2>
      <CardGrid density="compact" className="mt-3">
        {TILES.slice(0, 4).map((t) => (
          <TileCard key={t.title} title={t.title} emoji={t.emoji} href="/#" />
        ))}
      </CardGrid>

      <h2 className="text-[17px] font-semibold mt-10 text-[var(--color-fg)]">Announcements</h2>
      <CardGrid className="mt-3">
        <AnnouncementCard
          attribution="Clara’s Kitchen"
          title="Saturday is a rye week"
          body={'Pulling a dark rye out at 7. About forty loaves and they go quickly.\n\nThe seeded sourdough is back after a month off.'}
          href="/#"
        />
        <AnnouncementCard attribution="Valley Apiary" body="Closed this weekend — back the following Saturday." href="/#" />
      </CardGrid>

      <h2 className="text-[17px] font-semibold mt-10 text-[var(--color-fg)]">Status</h2>
      <div className="mt-3 space-y-2">
        <StatusDot color="#1b7a3d" label="Locally owned and operated" />
        <StatusDot color="#0e6b2e" label="Worker or member owned" />
        <StatusDot color="#b0b0b0" label="Competing against market consolidation" />
      </div>

      <h2 className="text-[17px] font-semibold mt-10 text-[var(--color-fg)]">Metrics</h2>
      <CardGrid density="compact" className="mt-3">
        <MetricTile label="Profile views" value={128} deltaLabel="+31 (+32%) vs prior 7d" points={[2, 4, 3, 6, 5, 9, 11]} />
        <MetricTile label="Support taps" value={9} deltaLabel="−2 (−18%) vs prior 7d" positive={false} points={[9, 8, 8, 6, 5, 5, 4]} />
        <MetricTile label="Followers" value={0} deltaLabel="No activity yet" positive={false} />
      </CardGrid>
    </main>
  )
}
