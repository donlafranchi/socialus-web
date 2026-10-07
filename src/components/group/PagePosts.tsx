'use client'

// F072 — a Page owner announces something, with a time and a place on it.
//
// THE WORD IS ANNOUNCEMENT. Not bulletin, which #176 retired, and not post,
// which is what the table is called and what nobody says out loud. Every
// user-facing string here says announcement or announce; the substrate keeps
// its own names (`page_posts`, `group.post_create`) because renaming a table
// is not a copy change.
//
// WHAT IS OPTIONAL AND WHY IT MATTERS. Both the time and the address are the
// announcement's own, and both may be absent. An announcement with no time is
// a first-class announcement — Maya's Saturday "sourdough is back" has no time
// and is no less an announcement for it — and is never returned by a
// time-windowed read, because it has no time to be inside a window. An
// announcement with no address reads as being at its Page's location.
//
// WHAT A FAILED SAVE LEAVES BEHIND: nothing (criterion 5). The row and its
// event are written in one transaction in the handler; here, the list is only
// touched after a success, so a failure leaves no announcement on screen that
// does not exist in the database.
//
// Acceptance 1: a member without the managing role gets no control, and the
// handler re-checks. Acceptance 4: there is no delete control, and no handler
// behind one.

import { pinLabel, DROPPED_PIN } from '@/lib/places/pin-label'
import { useEffect, useState } from 'react'
import type { PagePost } from '@/lib/groups/page-posts'
import { TagInput, type TagInputValue } from '@/components/tags/TagInput'
import { isValidTagLabel } from '@/lib/groups/tags'
import { formatPostDate } from '@/lib/groups/post-date'
import { ANNOUNCE_ANCHOR } from './announce-anchor'
import { announcementAnchor, announcementIdFromHash } from './announcement-anchor'
import { ANNOUNCEMENT_MARK, useAnnouncementAnchor } from './use-announcement-anchor'
import { METRO_TIME_ZONE, formatMetroDateTime, metroWallTimeToInstant } from '@/lib/metro/metro-time'
import { createLocationAction } from '@/app/_actions/location-actions'
import {
  AnnouncementFields,
  emptyWhenWhere,
  type AnnouncementWhenWhere,
} from './AnnouncementFields'
import { AudienceSwitch, FOLLOWERS_NOT_YET, type Audience } from './AudienceSwitch'
import { PostingSafetyNote } from '@/components/PostingSafetyNote'
import { AddToCalendarLink } from '@/components/calendar/AddToCalendarLink'
import { isLocationPlaceFieldsComplete } from '@/components/locations/LocationPlaceFields'

const BODY_LIMIT = 5000
const LATEST = 3
const latestIds = (posts: PagePost[]) =>
  [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, LATEST).map((p) => p.id)
const TRY_AGAIN = "That didn't go through. Mind trying again?"
/** F072 § Not this rules out all-day announcements, so a date with no time has
 *  nothing to become. Said as a sentence rather than refused silently. */
const HALF_A_TIME = 'Add both a date and a time, or leave them both empty.'
// #262 — placeholders ([public-is-draft]).
const END_NEEDS_START = 'Add a date and a start time before an end time.'
const END_BEFORE_START = 'The end time is before it starts.'

type CreateLocation = typeof createLocationAction

interface PostInput {
  groupId: string
  body: string
  startsAt?: string | null
  endsAt?: string | null
  locationId?: string | null
  howToFind?: string | null
  tags?: string[]
}

interface EditInput {
  postId: string
  body: string
  startsAt?: string | null
  endsAt?: string | null
  locationId?: string | null
  tags?: string[]
}

interface Props {
  groupId: string
  posts: PagePost[]
  canPost: boolean
  /** How many people get updates from this Page. Owner-only; see
   *  countPageFollowers for why it is a count and never a roster. */
  followerCount?: number
  onPost: (input: PostInput) => Promise<
    { ok: true; data: { postId: string; createdAt: string } } | { ok: false; message: string; code: string }
  >
  onEdit: (input: EditInput) => Promise<
    { ok: true; data: { postId: string } } | { ok: false; message: string; code: string }
  >
  onCreateLocation?: CreateLocation
  /** The form opens from the owner's Announce (#announce); tests start with it open. */
  startComposing?: boolean
  /** #318 — soft delete, after a confirm. */
  onDelete?: (input: { postId: string }) => Promise<
    { ok: true; data: { postId: string } } | { ok: false; message: string; code: string }
  >
}

/** `yyyy-mm-dd` and `hh:mm` back out of an instant, for an edit form that has
 *  to start from what is already there. */
function whenWhereFrom(post: PagePost): AnnouncementWhenWhere {
  if (!post.startsAt) return emptyWhenWhere
  const d = new Date(post.startsAt)
  if (Number.isNaN(d.getTime())) return emptyWhenWhere
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: METRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const at = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    ...emptyWhenWhere,
    date: `${at('year')}-${at('month')}-${at('day')}`,
    time: `${String(Number(at('hour')) % 24).padStart(2, '0')}:${at('minute')}`,
    endTime: post.endsAt ? metroClock(post.endsAt) : '',
  }
}

/** `hh:mm` of an instant in the metro — what a time input shows. */
function metroClock(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: METRO_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const at = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${String(Number(at('hour')) % 24).padStart(2, '0')}:${at('minute')}`
}

export function PagePosts({
  groupId,
  posts,
  canPost,
  followerCount = 0,
  onPost,
  onEdit,
  onCreateLocation = createLocationAction,
  onDelete,
  startComposing = false,
}: Props) {
  const [items, setItems] = useState<PagePost[]>(posts)
  const [draft, setDraft] = useState('')
  const [when, setWhen] = useState<AnnouncementWhenWhere>(emptyWhenWhere)
  const [audience, setAudience] = useState<Audience>('anyone')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editWhen, setEditWhen] = useState<AnnouncementWhenWhere>(emptyWhenWhere)
  // #286 — a post's own tags; none means it carries its Page's.
  const [tags, setTags] = useState<TagInputValue>({ tags: [], draft: '' })
  const [editTags, setEditTags] = useState<TagInputValue>({ tags: [], draft: '' })
  const tagSet = (v: TagInputValue) => [...v.tags, v.draft].filter(isValidTagLabel)

  // bug #211 — arrive on the announcement you tapped, not on the top of a Page
  // with a compose box where you expected it. Shared with the signed-out list
  // (F093), because an `#announcement-<id>` link has to land the same way on
  // both and two copies of the effect is how they stop doing that.
  // #462 — newest first; the latest three in a row, the rest a tap away.
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [showAll, setShowAll] = useState(false)
  // A link to an older post opens the list, so the post it names is there to land on.
  useEffect(() => {
    const id = announcementIdFromHash(window.location.hash)
    if (!id || !posts.some((p) => p.id === id) || latestIds(posts).includes(id)) return
    const frame = requestAnimationFrame(() => setShowAll(true))
    return () => cancelAnimationFrame(frame)
  }, [posts])
  const highlighted = useAnnouncementAnchor(showAll)
  // #472 first pass — the form is rarely used, so it waits for Announce
  // (Google Business Profile's "Add update" opens on request).
  const [composing, setComposing] = useState(startComposing)
  useEffect(() => {
    if (!canPost) return
    const open = () => {
      if (window.location.hash === `#${ANNOUNCE_ANCHOR}`) requestAnimationFrame(() => setComposing(true))
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [canPost])

  // A visitor looking at a Page with nothing on it sees no empty section. The
  // owner does, because the owner is the one who can fill it.
  if (!canPost && items.length === 0) return null

  /**
   * The time and the place, resolved, or a message saying why not.
   *
   * Both halves happen BEFORE the announcement is written, so a place that
   * cannot be made never leaves a half-made announcement behind it.
   */
  async function resolveWhenWhere(
    w: AnnouncementWhenWhere,
  ): Promise<
    | {
        ok: true
        startsAt: string | null
        endsAt: string | null
        locationId: string | null
        locationLabel: string | null
      }
    | { ok: false; message: string }
  > {
    const hasDate = w.date.trim().length > 0
    const hasTime = w.time.trim().length > 0
    if (hasDate !== hasTime) return { ok: false, message: HALF_A_TIME }

    let startsAt: string | null = null
    if (hasDate && hasTime) {
      startsAt = metroWallTimeToInstant(w.date, w.time)
      if (!startsAt) return { ok: false, message: HALF_A_TIME }
    }

    let endsAt: string | null = null
    if (w.endTime.trim()) {
      if (!startsAt) return { ok: false, message: END_NEEDS_START }
      endsAt = metroWallTimeToInstant(w.date, w.endTime)
      if (!endsAt || new Date(endsAt) <= new Date(startsAt)) return { ok: false, message: END_BEFORE_START }
    }

    let locationId: string | null = null
    let locationLabel: string | null = null
    if (w.addingPlace && isLocationPlaceFieldsComplete(w.place)) {
      // #348 — a dropped pin is named by what's around it, as Google Maps does.
      const named =
        w.place.mode === 'address' && w.place.selectedAddress!.name === DROPPED_PIN
          ? await pinLabel(w.place.selectedAddress!.coordinates[0], w.place.selectedAddress!.coordinates[1])
          : w.place.selectedAddress?.name ?? ''
      const made = await onCreateLocation(
        w.place.mode === 'address'
          ? {
              label: named,
              address: {
                geographyWkt: `SRID=4326;POINT(${w.place.selectedAddress!.coordinates[0]} ${w.place.selectedAddress!.coordinates[1]})`,
                resolvedAddressText: named,
              },
            }
          : { label: w.place.addressQuery, neighborhoodId: w.place.neighborhoodId! },
      )
      if (!made.ok) return { ok: false, message: made.message }
      locationId = made.data.id
      // Carried back so the announcement that appears right after posting says
      // where it is, rather than looking placeless until the next load.
      locationLabel = made.data.label
    }

    return { ok: true, startsAt, endsAt, locationId, locationLabel }
  }

  const submit = async () => {
    const body = draft.trim()
    if (!body || busy) return
    // The restricted setting is visible and not postable: delivery to the
    // people who get updates from you does not exist, and an announcement
    // addressed to forty-two people none of whom receive it is a lie.
    if (audience !== 'anyone') {
      setError(FOLLOWERS_NOT_YET)
      return
    }
    setBusy(true)
    setError(null)

    const resolved = await resolveWhenWhere(when)
    if (!resolved.ok) {
      setBusy(false)
      setError(resolved.message)
      return
    }

    const r = await onPost({
      groupId,
      body,
      startsAt: resolved.startsAt,
      endsAt: resolved.endsAt,
      locationId: resolved.locationId,
      ...(when.addingPlace ? { howToFind: when.howToFind } : {}),
      tags: tagSet(tags),
    })
    setBusy(false)
    if (!r.ok) {
      setError(r.message || TRY_AGAIN)
      return
    }
    setItems([
      {
        id: r.data.postId,
        body,
        createdAt: r.data.createdAt,
        updatedAt: r.data.createdAt,
        startsAt: resolved.startsAt,
        endsAt: resolved.endsAt,
        locationLabel: resolved.locationLabel,
        howToFind: when.addingPlace && when.howToFind.trim() ? when.howToFind.trim() : null,
        tags: tagSet(tags),
      },
      ...items,
    ])
    setDraft('')
    setWhen(emptyWhenWhere)
    setTags({ tags: [], draft: '' })
  }

  const saveEdit = async (postId: string) => {
    const body = editDraft.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)

    const resolved = await resolveWhenWhere(editWhen)
    if (!resolved.ok) {
      setBusy(false)
      setError(resolved.message)
      return
    }

    const r = await onEdit({
      postId,
      body,
      startsAt: resolved.startsAt,
      endsAt: resolved.endsAt,
      // An edit that did not open the address control leaves the address
      // alone. `undefined` is "don't touch"; `null` would be "remove".
      ...(editWhen.addingPlace ? { locationId: resolved.locationId } : {}),
      tags: tagSet(editTags),
    })
    setBusy(false)
    if (!r.ok) {
      setError(r.message || TRY_AGAIN)
      return
    }
    // In place: the id is unchanged, so this rewrites the row already here and
    // it stays the same announcement.
    setItems(
      items.map((p) =>
        p.id === postId
          ? {
              ...p,
              body,
              startsAt: resolved.startsAt,
              endsAt: resolved.endsAt,
              tags: tagSet(editTags),
              ...(editWhen.addingPlace ? { locationLabel: resolved.locationLabel } : {}),
            }
          : p,
      ),
    )
    setEditingId(null)
  }

  const renderPost = (post: PagePost, compact: boolean) => (
            <li
              key={post.id}
              id={announcementAnchor(post.id)}
              data-testid="page-post"
              // The mark is a ring rather than a background: it says "this
              // one" without restyling the announcement into something that
              // looks like a different kind of thing.
              data-highlighted={highlighted === post.id ? 'true' : undefined}
              className={`card border border-[var(--color-border)] p-3 scroll-mt-24${compact ? ' w-64 shrink-0 snap-start' : ''}${highlighted === post.id ? ANNOUNCEMENT_MARK : ''}`}
            >
              {editingId === post.id ? (
                <div className="flex flex-col gap-3">
                  <label htmlFor={`edit-${post.id}`} className="sr-only">
                    Edit your post
                  </label>
                  <textarea
                    id={`edit-${post.id}`}
                    data-testid="page-post-edit-body"
                    value={editDraft}
                    maxLength={BODY_LIMIT}
                    rows={3}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="w-full rounded border border-[var(--color-control-border)] p-3 text-sm"
                  />
                  <AnnouncementFields
                    value={editWhen}
                    onChange={setEditWhen}
                    idPrefix="page-post-edit"
                    placeLabel={post.locationLabel}
                  />
                  <TagInput idPrefix="announce-edit-tag" label="Tags (optional)" value={editTags} onChange={setEditTags} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid="page-post-edit-save"
                      onClick={() => saveEdit(post.id)}
                      disabled={busy || editDraft.trim().length === 0}
                      className="btn-primary disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      data-testid="page-post-edit-cancel"
                      onClick={() => setEditingId(null)}
                      className="text-sm underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className={`whitespace-pre-wrap text-sm text-[var(--color-charcoal-900)]${compact ? ' line-clamp-4' : ''}`}>{post.body}</p>

                  {/* When and where it is — the announcement's own, not its
                      Page's. Shown above the line that says when it was
                      written, because what is happening matters more than
                      when somebody typed it. */}
                  {(post.startsAt || post.locationLabel) && (
                    <p className="mt-2 text-sm text-[var(--color-fg)]" data-testid="page-post-when">
                      {post.startsAt ? formatMetroDateTime(post.startsAt, undefined, undefined, post.endsAt) : null}
                      {post.startsAt && post.locationLabel ? ' · ' : null}
                      {post.locationLabel}
                    </p>
                  )}
                  {post.howToFind && (
                    <p className="mt-1 text-sm text-[var(--color-fg-muted)]" data-testid="page-post-how">
                      How to find us: {post.howToFind}
                    </p>
                  )}

                  {post.startsAt && (
                    <div className="mt-2">
                      <AddToCalendarLink
                        uid={`${post.id}@socialus.org`}
                        title={post.body.split('\n')[0].slice(0, 120)}
                        start={post.startsAt}
                        end={post.endsAt}
                        location={post.locationLabel ?? null}
                      />
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-xs text-gray-500">{formatPostDate(post.createdAt)}</span>
                    {canPost && (
                      <button
                        type="button"
                        data-testid="page-post-edit"
                        onClick={() => {
                          setShowAll(true)
                          setEditingId(post.id)
                          setEditDraft(post.body)
                          setEditWhen(whenWhereFrom(post))
                          setEditTags({ tags: post.tags ?? [], draft: '' })
                          setError(null)
                        }}
                        className="text-xs underline"
                      >
                        Edit
                      </button>
                    )}
                    {canPost && onDelete && (
                      <button
                        type="button"
                        data-testid="page-post-delete"
                        onClick={() => {
                          setShowAll(true)
                          setConfirmingDelete(post.id)
                        }}
                        className="text-xs underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {confirmingDelete === post.id && onDelete && (
                    <div
                      role="alertdialog"
                      aria-label="Delete this post?"
                      data-testid="page-post-delete-confirm"
                      className="mt-2 flex flex-col gap-2 rounded-md border border-[var(--color-control-border)] p-3"
                    >
                      <p className="text-body-sm text-[var(--color-fg)]">
                        Delete this post? It comes off your Page and Explore.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true)
                            const r = await onDelete({ postId: post.id })
                            setBusy(false)
                            setConfirmingDelete(null)
                            if (!r.ok) {
                              setError(r.message || TRY_AGAIN)
                              return
                            }
                            setItems(items.filter((p) => p.id !== post.id))
                          }}
                          className="btn-primary"
                        >
                          Delete post
                        </button>
                        <button type="button" onClick={() => setConfirmingDelete(null)} className="btn-secondary">
                          Keep it
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </li>
  )

  return (
    <section id={ANNOUNCE_ANCHOR} aria-labelledby="page-posts-title" className="card scroll-mt-20 border border-[var(--color-border)] p-4" data-testid="page-posts" data-section="posts">
      <h2 id="page-posts-title" className="text-title-3 text-[var(--color-fg)]">Posts</h2>

      {canPost && composing && (
        <div className="mt-3 flex flex-col gap-3">
          <label htmlFor="page-post-body" className="sr-only">
            What do you want people to know?
          </label>
          <textarea
            id="page-post-body"
            data-testid="page-post-body"
            value={draft}
            maxLength={BODY_LIMIT}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="What do you want people to know?"
            className="w-full rounded border border-[var(--color-control-border)] p-3 text-sm"
          />

          <AnnouncementFields value={when} onChange={setWhen} idPrefix="announce" />

          <TagInput idPrefix="announce-tag" label="Tags (optional)" value={tags} onChange={setTags} />

          <AudienceSwitch
            value={audience}
            onChange={setAudience}
            followerCount={followerCount}
            idPrefix="announce"
          />

          <PostingSafetyNote />

          <div>
            <button
              type="button"
              data-testid="page-post-send"
              onClick={submit}
              disabled={busy || draft.trim().length === 0 || audience !== 'anyone'}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? 'Announcing' : 'Announce'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" data-testid="page-post-error" className="mt-2 text-sm text-[var(--color-charcoal-900)]">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div
          data-testid="page-posts-empty"
          className="mt-3 rounded border border-dashed border-gray-300 p-6 text-sm text-gray-500"
        >
          <p>Nothing here yet. Tell people what&apos;s going on.</p>
        </div>
      ) : showAll ? (
        <ul data-testid="page-posts-all" className="mt-4 flex flex-col gap-3">
          {sorted.map((post) => renderPost(post, false))}
        </ul>
      ) : (
        // A row that scrolls inside its own section, never the page.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must take focus to scroll by keyboard (WCAG 2.1.1)
        <ul data-testid="page-posts-latest" tabIndex={0} aria-label="Latest posts" className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2">
          {sorted.slice(0, LATEST).map((post) => renderPost(post, true))}
        </ul>
      )}
      {sorted.length > LATEST && (
        <button
          type="button"
          aria-expanded={showAll}
                    onClick={() => setShowAll(!showAll)}
          className="press mt-3 inline-flex min-h-tap items-center text-body-sm font-semibold text-[var(--color-accent)] underline"
        >
          {showAll ? 'Show the latest' : 'See all posts'}
        </button>
      )}
    </section>
  )
}
