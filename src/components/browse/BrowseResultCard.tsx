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
//
// Don (2026-11-02): "our posts should be a little bit larger." A post card sets its photo on top at the card's full
// width, 3:2 (between Eventbrite's 2:1 and Airbnb's near-square), with the words beneath it, at every width.

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
import { cardHeadline, cardPreview, leadLineParts, venueShow } from '@/lib/posts/lead-line'
import { postKindOf } from '@/lib/browse/filters'
import { cardImageAlt } from '@/lib/calendar/ics'
import { browseCardLocation } from '@/lib/browse/card'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import type { ReactNode } from 'react'
import { SharePageButton } from '@/components/group/SharePageButton'
import { postPath } from '@/lib/posts/post-path'
import { HeartButton, SaveButton } from '@/components/hearts/HeartSave'

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
      className={`group/tile flex flex-col${watermark ? ' relative overflow-hidden' : kind === 'post' ? ' @container relative' : ''}`}
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
  const marks = !result.sampleKind
  const preview = cardPreview({ headline: result.headline, body: result.body, pageName: result.name })
  const lead = leadLineParts(
    {
      kind: postKindOf(result) ?? 'news',
      startsAt: result.startsAt,
      endsAt: result.endsAt,
      postedAt: result.postedAt,
      where: result.locationLabel,
      sample: Boolean(result.sampleKind),
      show: venueShow({ body: result.body, tags: result.tags }),
    },
    now,
  )
  // F099 — the card's ONE image: the post's own photo, else the Page picture, else the kind's art.
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
      // Don, 2026-10-31 — Share, outside the card's link so a tap on it never opens the card. #1127: in the card's
      // bottom corner, level with the Page's name, rather than on a row of its own.
      after={
        <>
          {result.href ? <div className="absolute bottom-1.5 right-1.5"><SharePageButton quiet testId="browse-post-share" title={headline} path={result.href.startsWith('/g/') ? postPath(result.href, { id: result.resultId }) : result.href} /></div> : null}
          {/* #1171 — ♡ and Save under the picture, Instagram's place: the heart at the left, the save at the right. Outside the
              card's link, so a tap never opens the card; the spacer below keeps their row. A sample has neither. */}
          {marks && (
            <div data-testid="post-marks" className="absolute inset-x-1 top-[calc(100cqw*2/3)] flex items-center justify-between">
              <HeartButton target={{ postId: result.resultId }} />
              <SaveButton postId={result.resultId} />
            </div>
          )}
        </>
      }
    >
      <div data-testid="browse-post-body" className="flex flex-col-reverse">
        <div data-testid="tile-text" className={`min-w-0 flex-1 px-3 pb-3${marks ? '' : ' pt-2.5'}`}>
          {/* #1127 — one line. A long where is cut short; with too little room for it (under 4.5rem, basis-18) it wraps onto a
              second line the fixed height hides, so a lead never ends in a bare "· …". */}
          <p data-testid="browse-post-lead" className={`${SMALL_CAPS} flex h-4 min-w-0 flex-wrap overflow-hidden whitespace-nowrap font-bold leading-4 text-[var(--color-fg)]`}>
            <span data-testid="browse-post-lead-head" className="max-w-full shrink-0 truncate">{lead.head}</span>
            {lead.where && <span data-testid="browse-post-lead-where" className="min-w-0 grow basis-18 truncate">&nbsp;· {lead.where}</span>}
          </p>
          {headline && (
            <p data-testid="tile-title" className="mt-1 line-clamp-1 text-body font-semibold leading-5 text-[var(--color-fg)] transition-colors group-hover/tile:text-[var(--color-accent)]">
              {headline}
            </p>
          )}
          {/* Don, 2026-11-02: "a line or two about the post". Two lines, cut short; the whole card opens the post, so no See more. */}
          {preview && (
            <p data-testid="browse-post-preview" className="mt-0.5 line-clamp-2 text-sm leading-5 text-[var(--color-fg-muted)]">
              {preview}
            </p>
          )}
          <p data-testid="tile-kind-row" className={`mt-2 flex items-center gap-2 text-caption text-[var(--color-fg-muted)]${result.href ? ' pr-10' : ''}`}>
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
        {marks && <div aria-hidden="true" className="h-tap shrink-0" />}
        <div data-testid="tile-image" className="flex aspect-[3/2] w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--color-surface)]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sizedMediaUrl(photo, 480)} srcSet={sizedMediaSrcSet(photo, 480)} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <DefaultArt kind={artKindFor(result.groupKind)} />
          )}
        </div>
      </div>
    </Shell>
  )
}
