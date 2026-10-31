// A browse result as a card.
//
// Uses the card system rather than inventing another card — CardGrid decides
// how many cells there are and TileCard fills one, so the surface reflows from
// an iPhone mini to a 27-inch monitor with every card the same height.
//
// Pages and posts are different results and read as different cards, but both
// carry the Page's name (F059 criterion 9). #922 (Don, 2026-10-18): a Page card
// leads with its photo (~80/20: large photo, name, one line, up to two labels
// set as small-caps text, quick links); a post card leads with its words
// (~60/40: a strong date line, a title, two lines, a smaller photo, the Page's
// name and avatar). No chips or pills [always].
//
// plan #230 (Don, 2026-10-31): "I need people to see exactly what's being offered." A post card opens with
// KIND · WHEN · WHERE in small caps, built from fields and never the body, then a one-line headline without the
// Page's name, then the Page's avatar and name. A sample says Sample once, in that lead line: no watermark, no
// label, no disclaimer on the card (the Page keeps its disclaimer).

import { sizedMediaUrl, sizedMediaSrcSet } from '@/lib/media/served-url'
import { kindLine } from '@/lib/groups/page-kind'
import { DefaultArt, artKindFor } from '@/components/cards/DefaultArt'
import { Card } from '@/components/cards/Card'
import { HandoffLink } from '@/components/cards/HandoffLink'
import { locationLine } from '@/components/cards/location'
import { QuickLinks } from '@/components/cards/QuickLinks'
import { TypeMark, SampleLabel, SampleWatermark } from '@/components/cards/CardMarks'
import { WithheldAnnouncementCard } from './WithheldAnnouncementCard'
import { formatCardWhen } from '@/lib/metro/metro-time'
import { cardHeadline, leadLine } from '@/lib/posts/lead-line'
import { postKindOf } from '@/lib/browse/filters'
import { cardImageAlt } from '@/lib/calendar/ics'
import { browseCardLocation } from '@/lib/browse/card'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import type { ReactNode } from 'react'
import { SharePageButton } from '@/components/group/SharePageButton'
import { postPath } from '@/lib/posts/post-path'

/** Small caps for labels and the date line: typography, never a pill. */
const SMALL_CAPS = 'text-micro font-semibold uppercase tracking-wider'

export function BrowseResultCard({
  result,
  as = 'li',
  prefetch,
  now,
}: {
  result: BrowseResult
  /** For tests: the clock the lead line's Today and weekdays are read against. */
  now?: Date
  /** #555 — read this card's Page ahead of the tap (the top of the list, where the taps are). */
  prefetch?: boolean
  /** #270 — 'div' when the caller already provides the list item. */
  as?: 'li' | 'div'
}) {
  // F093 — a withheld announcement is a different card, and the choice lives
  // here rather than in BrowseSurface so that every surface rendering browse
  // results gets it without being told: the grid, the map's list, and whatever
  // renders results next.
  if (result.withheld) return <WithheldAnnouncementCard result={result} as={as} />
  return result.resultKind === 'post' ? <PostCard result={result} as={as} prefetch={prefetch} now={now} /> : <PageCard result={result} as={as} prefetch={prefetch} />
}

type CardProps = { result: BrowseResult; as: 'li' | 'div'; prefetch?: boolean; now?: Date }

function Shell({ result, as, prefetch, kind, imageUrl, children, after }: CardProps & { kind: 'page' | 'post'; imageUrl: string | null; children: ReactNode; after?: ReactNode }) {
  const kl = kindLine(result.groupKind, undefined, null)
  const watermark = kind === 'page' && result.sampleKind
  return (
    <Card
      as={as}
      interactive={Boolean(result.href)}
      data-testid="tile-card"
      data-card={kind}
      className={`group/tile flex flex-col${watermark ? ' relative overflow-hidden' : ''}`}
    >
      {result.href ? (
        // #555 — on the press the card hands the Page its name, kind and photo, so the Page opens on its own shell.
        <HandoffLink href={result.href} prefetch={prefetch} className="block" handoff={{ name: result.name, kindLine: kl, imageUrl: sizedMediaUrl(imageUrl, 800) ?? null }}>
          {children}
        </HandoffLink>
      ) : (
        children
      )}
      {after}
      {watermark ? <SampleWatermark /> : null}
    </Card>
  )
}

function Marks({ result, type }: { result: BrowseResult; type: 'page' | 'post' }) {
  return (
    <>
      <TypeMark type={type} />
      {result.sampleKind ? <SampleLabel /> : null}
      {/* The kind line, on cards too (ruled 2026-10-05). */}
      <span data-testid="tile-kind" className="line-clamp-1">{kindLine(result.groupKind, undefined, null)}</span>
    </>
  )
}

function PageCard(props: CardProps) {
  const { result } = props
  const labels = result.tags.slice(0, 2)
  const point = result.latitude !== null && result.longitude !== null ? { latitude: result.latitude, longitude: result.longitude } : null
  return (
    <Shell
      {...props}
      kind="page"
      imageUrl={result.photoUrl}
      after={result.quickLinks ? <div className="px-3 pb-2"><QuickLinks links={result.quickLinks} name={result.name} point={point} /></div> : null}
    >
      <div data-testid="tile-image" className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-[var(--color-surface)]">
        {result.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sizedMediaUrl(result.photoUrl, 400)} srcSet={sizedMediaSrcSet(result.photoUrl, 400)} alt={result.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <DefaultArt kind={artKindFor(result.groupKind)} />
        )}
      </div>
      <div data-testid="tile-text" className="px-3 pb-2 pt-2.5">
        <p data-testid="tile-title" className="line-clamp-1 text-body font-semibold leading-5 text-[var(--color-fg)] transition-colors group-hover/tile:text-[var(--color-accent)]">
          {result.name}
        </p>
        <p data-testid="tile-tagline" className="mt-0.5 line-clamp-1 text-sm leading-5 text-[var(--color-fg-muted)]">
          {result.description ?? locationLine(browseCardLocation(result))}
        </p>
        <p data-testid="tile-kind-row" className="mt-1.5 flex items-center gap-1.5 text-caption text-[var(--color-fg-muted)]">
          <Marks result={result} type="page" />
        </p>
        {/* #922 — up to two labels, plain words in small caps: never chips, never hashtags. */}
        {labels.length > 0 && (
          <p data-testid="card-labels" className={`${SMALL_CAPS} mt-1 line-clamp-1 text-[var(--color-fg-muted)]`}>
            {labels.join(' · ')}
          </p>
        )}
      </div>
    </Shell>
  )
}

/** A post's title is its first line; the rest is its body. */
export function splitPost(body: string | null): { title: string; rest: string } {
  const text = (body ?? '').trim()
  const nl = text.indexOf('\n')
  if (nl < 0) return { title: text, rest: '' }
  return { title: text.slice(0, nl).trim(), rest: text.slice(nl + 1).trim() }
}

function PostCard(props: CardProps) {
  const { result, now } = props
  const headline = cardHeadline({ headline: result.headline, body: result.body, pageName: result.name })
  const lead = leadLine(
    {
      kind: postKindOf(result) ?? 'news',
      startsAt: result.startsAt,
      endsAt: result.endsAt,
      postedAt: result.postedAt,
      where: result.locationLabel,
      sample: Boolean(result.sampleKind),
    },
    now,
  )
  // F099 — the card's ONE image, smaller here: the post's own photo, else the Page picture, else the kind's art.
  const photo = result.photoUrl
  const avatar = result.pageAvatarUrl ?? (result.photoSource === 'page' ? result.photoUrl : null)
  // F099 criterion 10: the owner's words for a post's own photo, the Page's name for the Page picture.
  const alt =
    result.photoSource === 'page'
      ? result.name
      : (result.photoSource === 'post' && headline.slice(0, 120)) ||
        cardImageAlt({
          title: result.name,
          when: result.startsAt ? formatCardWhen(result.startsAt, undefined, undefined, result.endsAt) : null,
          place: result.locationLabel,
        })
  return (
    <Shell
      {...props}
      kind="post"
      imageUrl={photo}
      // Don, 2026-10-31 — Share, outside the card's link so a tap on it never opens the card.
      after={result.href ? <div className="-mt-5 flex justify-end px-1"><SharePageButton quiet testId="browse-post-share" title={headline} path={postPath(result.href, result.resultId)} /></div> : null}
    >
      <div className="flex gap-3 p-3">
        <div data-testid="tile-text" className="min-w-0 flex-1">
          <p data-testid="browse-post-lead" className={`${SMALL_CAPS} line-clamp-2 font-bold text-[var(--color-fg)]`}>
            {lead}
          </p>
          {headline && (
            <p data-testid="tile-title" className="mt-1 line-clamp-1 text-body font-semibold leading-5 text-[var(--color-fg)] transition-colors group-hover/tile:text-[var(--color-accent)]">
              {headline}
            </p>
          )}
          <p data-testid="tile-kind-row" className="mt-2 flex items-center gap-2 text-caption text-[var(--color-fg-muted)]">
            <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface)] text-micro font-semibold text-[var(--color-fg)]">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sizedMediaUrl(avatar, 96)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                result.name.trim().charAt(0).toUpperCase()
              )}
            </span>
            <span data-testid="post-page-name" className="line-clamp-1 font-medium text-[var(--color-fg)]">{result.name}</span>
          </p>
        </div>
        <div data-testid="tile-image" className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--color-surface)]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sizedMediaUrl(photo, 320)} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <DefaultArt kind={artKindFor(result.groupKind)} />
          )}
        </div>
      </div>
    </Shell>
  )
}
