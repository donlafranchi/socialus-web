// A DESIGN REFERENCE, NOT PRODUCT. This branch is never merged to main.
//
// Don asked to see how the /you cards looked before the vendor deletion, so he
// can reuse the design language elsewhere. These are recovered from git —
// `ccbf54d` (main immediately before #124) and `4db3670` (before #125) — and
// re-rendered here with placeholder content.
//
// The markup is inlined rather than importing the recovered components on
// purpose: those components import types, hooks and tables that no longer
// exist, so importing them would drag the vendor era back into the tree. What
// matters here is the shape, and the shape is the markup.
//
// It lives under `(dev)` as of 2026-09-17. It could not before: that group's
// layout gated on NODE_ENV, so a page there rendered on a laptop and 404'd on
// every preview — backwards for something read on a phone. #132 changed the
// gate to VERCEL_ENV and forced dynamic rendering, so `(dev)` now renders on
// previews and 404s only in production. This branch still does not merge, but
// the gate is what keeps it out of production rather than that alone.

export const metadata = { title: 'Design archive — the /you cards' }

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)] mt-2 mb-5 border-l-2 border-[var(--color-border)] pl-3">
      {children}
    </p>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[17px] font-semibold text-[var(--color-fg)]">{title}</h2>
      {children}
    </section>
  )
}

const SWATCHES: Array<[string, string]> = [
  ['--color-bg', '#ffffff'],
  ['--color-surface', '#f7f6f2'],
  ['--color-fg', '#1a1a1a'],
  ['--color-fg-muted', '#6b6b6b'],
  ['--color-border', '#e5e3dd'],
  ['--color-accent', '#0fab8e'],
  ['--color-accent-tint', '#e8f7f2'],
]

export default function DesignArchivePage() {
  return (
    <main className="max-w-md mx-auto px-4 pb-24 pt-6 bg-[var(--color-bg)]">
      <header>
        <p className="text-xs uppercase tracking-wider text-[var(--color-fg-muted)] font-semibold">
          Design archive
        </p>
        <h1 className="text-2xl font-semibold text-[var(--color-fg)] mt-1">The /you cards</h1>
        <p className="text-sm text-[var(--color-fg-muted)] mt-2">
          Recovered from git as they looked before the vendor deletion. Placeholder content —
          nothing here is wired to anything. Reference only; this never ships.
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      <Section title="1 · The tile card">
        <Note>
          The workhorse. A <strong>fixed-width</strong> card (224px, 176px compact) built to sit in a
          horizontal scroller, not a grid. Image block on top at a fixed height with its own rounded
          corners <em>inside</em> the card&rsquo;s, then a text block, then an action. Never a border —
          the separation is the white card against the warm off-white page, plus a shadow that only
          appears on hover.
        </Note>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
          {[
            { name: 'Clara’s Kitchen', tagline: 'Sourdough, focaccia, and a weekly cinnamon thing.', emoji: '🥖', meta: 'Oak Park · Sun' },
            { name: 'Held Ceramics', tagline: 'Hand-thrown mugs and small plates.', emoji: '🏺', meta: 'Midtown · Sat' },
            { name: 'Two Rivers Honey', tagline: null, emoji: '🍯', meta: null },
          ].map((v) => (
            <div key={v.name} className="flex-shrink-0 w-56 card card-hover">
              <div className="h-32 rounded-xl overflow-hidden bg-[var(--color-surface)] flex items-center justify-center text-3xl">
                <span>{v.emoji}</span>
              </div>
              <div className="pt-3 pb-1">
                <p className="font-medium text-[15px] text-[var(--color-fg)] line-clamp-1">{v.name}</p>
                {v.tagline && (
                  <p className="text-sm text-[var(--color-fg-muted)] mt-1 line-clamp-2">{v.tagline}</p>
                )}
                {v.meta && <p className="text-sm text-[var(--color-fg)] mt-2 font-medium">{v.meta}</p>}
              </div>
              <div className="pt-2">
                <button type="button" className="chip w-full justify-center">Follow</button>
              </div>
            </div>
          ))}
        </div>
        <Note>
          <strong>The empty-image state is the interesting part.</strong> No photo means a big emoji
          centred on the warm surface colour — never a grey box, never a broken frame. The card keeps
          its exact height either way, so a row of cards with mixed photos still lines up.
        </Note>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="2 · The announcement card">
        <Note>
          Full-width, same card shell, <strong>padded inside</strong> (p-4) rather than letting an
          image bleed to the edge. Three type sizes stacked: a small coloured attribution line, a
          semibold title, then body text clamped to three lines. The overflow control sits top-right,
          outside the tappable link area.
        </Note>
        <article className="card card-hover p-4 relative">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--color-accent)]">Clara’s Kitchen</p>
              <h3 className="text-sm font-semibold text-neutral-900 mt-1">Saturday is a rye week</h3>
              <p className="text-sm text-neutral-700 mt-1 line-clamp-3 whitespace-pre-wrap">
                Pulling a dark rye out at 7. There will be about forty loaves and they go quickly, so
                come early if you want one. Also bringing the seeded sourdough back after a month off.
              </p>
            </div>
            <button type="button" aria-label="Options" className="p-1 text-neutral-500">
              <span aria-hidden className="text-lg leading-none">···</span>
            </button>
          </div>
        </article>
        <Note>
          The attribution in accent green doing the work a photo would do elsewhere — it tells you
          whose voice this is before you read a word of it.
        </Note>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="3 · The detail sheet">
        <Note>
          Not a card — a <strong>bottom sheet</strong>. Rounded on the top corners only, shadow cast
          upward, capped at 70% of screen height and scrolls inside itself. Content is a strict
          hierarchy: name at 22px bold, then a badge, then muted metadata lines at 14px, then a
          rule, then body, then one full-width primary action at the bottom.
        </Note>
        <div className="relative h-[420px] rounded-xl overflow-hidden bg-[var(--color-surface)]">
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--color-fg-muted)]">
            map behind
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-[0_-6px_16px_rgba(0,0,0,0.12)] p-6 pb-8 max-h-[70%] overflow-y-auto">
            <button type="button" aria-label="Close" className="absolute top-3 right-4 text-[var(--color-fg-muted)] text-2xl leading-none">
              ×
            </button>
            <h2 className="text-[22px] font-bold pr-8 leading-tight text-[var(--color-fg)]">
              Clara’s Kitchen
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: '#1b7a3d' }} />
              <span className="text-sm font-medium">Locally owned and operated</span>
            </div>
            <p className="text-sm text-[var(--color-fg-muted)] mt-3">3117 Broadway, Sacramento, CA 95817</p>
            <p className="text-sm text-[var(--color-fg-muted)] mt-1">Bakery</p>
            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <p className="text-[15px] leading-relaxed text-[var(--color-fg)]">
                Clara started baking out of a home kitchen in 2019 and moved into the Broadway space
                two years later. Everything is mixed by hand the night before…
              </p>
              <button type="button" className="text-sm text-[var(--color-fg)] underline mt-2">Read more</button>
            </div>
            <div className="mt-5">
              <button type="button" className="btn-primary w-full">Support</button>
            </div>
          </div>
        </div>
        <Note>
          <strong>The badge is a 12px dot plus a sentence</strong> — never an icon, never a coloured
          pill. It reads as a fact about the business rather than a label stuck on it. The long-text
          treatment truncates at 200 characters with an underlined &ldquo;Read more&rdquo;, not a
          fade-out.
        </Note>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="4 · The metric tile">
        <Note>
          Same card shell, p-4, and a rigid four-part structure: a tiny uppercase tracked label, a
          large number, a sparkline sharing that row and baseline-aligned to the right, and a small
          delta line underneath that turns accent green when positive and grey when not.
        </Note>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Profile views', value: 128, delta: '+31 (+32%) vs prior 7d', up: true },
            { label: 'Support taps', value: 9, delta: '−2 (−18%) vs prior 7d', up: false },
          ].map((m) => (
            <div key={m.label} className="card p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">{m.label}</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="text-2xl font-semibold text-neutral-900">{m.value}</p>
                <svg viewBox="0 0 48 16" className={`w-12 h-4 ${m.up ? 'text-[var(--color-accent)]' : 'text-neutral-400'}`} aria-hidden>
                  <polyline
                    points={m.up ? '0,14 8,11 16,12 24,7 32,8 40,3 48,2' : '0,3 8,5 16,4 24,9 32,8 40,12 48,13'}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <p className={`text-xs mt-1 ${m.up ? 'text-[var(--color-accent)]' : 'text-neutral-500'}`}>{m.delta}</p>
            </div>
          ))}
        </div>
        <Note>
          Note what it does with nothing to show: the delta line says{' '}
          <em>&ldquo;No activity yet&rdquo;</em> rather than <em>0%</em>. Every one of these cards has
          a written empty state, not a zero.
        </Note>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="5 · The settings row">
        <Note>
          Not a card at all — a bordered rounded rectangle, one of the few places a border appears.
          Label above value on the left, an inline text button on the right in accent green. Used for
          anything that is a current setting plus a way to change it.
        </Note>
        <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">Your Market</p>
            <p className="text-sm font-medium text-neutral-900 truncate">
              Oak Park <span className="text-neutral-500 font-normal">· Sacramento</span>
            </p>
          </div>
          <button type="button" className="text-sm font-medium text-[var(--color-accent)]">Change</button>
        </section>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="6 · Pill tabs">
        <Note>
          Fully rounded, filled accent when active, neutral-100 when not. No underline, no bottom
          border. They sit directly on the page background with no container.
        </Note>
        <nav className="flex gap-2">
          {['saved', 'following', 'settings'].map((t, i) => (
            <button
              key={t}
              type="button"
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${
                i === 0 ? 'bg-[var(--color-accent)] text-white' : 'bg-neutral-100 text-neutral-700'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="7 · The palette these all sit in">
        <Note>
          The reason it reads as designed rather than default: the page is <strong>not white</strong>
          — cards are white on a warm off-white, and the only saturated colour in the whole system is
          one teal accent.
        </Note>
        <ul className="space-y-2">
          {SWATCHES.map(([name, hex]) => (
            <li key={name} className="flex items-center gap-3">
              <span
                className="inline-block w-8 h-8 rounded-lg border border-[var(--color-border)] shrink-0"
                style={{ backgroundColor: hex }}
              />
              <code className="text-[13px] text-[var(--color-fg)]">{name}</code>
              <code className="text-[13px] text-[var(--color-fg-muted)] ml-auto">{hex}</code>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="What was real, and what was not">
        <Note>
          Every card above was <strong>visual only</strong>. The tile card, the announcement card and
          the metric tiles all read tables that do not exist and never did —{' '}
          <code className="text-[12px]">vendors</code>, <code className="text-[12px]">businesses</code>,{' '}
          <code className="text-[12px]">follows</code>, <code className="text-[12px]">supports</code>,{' '}
          <code className="text-[12px]">vendor_bulletins</code>,{' '}
          <code className="text-[12px]">vendor_stats_daily</code>. They rendered empty in the running
          app. The design is real work worth keeping; the wiring underneath it was not there.
        </Note>
        <p className="text-[13px] text-[var(--color-fg-muted)] mt-4">
          Recovered from <code className="text-[12px]">ccbf54d</code> (before #124) and{' '}
          <code className="text-[12px]">4db3670</code> (before #125). Source files are in{' '}
          <code className="text-[12px]">design-archive/recovered/</code> on this branch.
        </p>
      </Section>
    </main>
  )
}
