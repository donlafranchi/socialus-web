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

import { useState } from 'react'
import type { PagePost } from '@/lib/groups/page-posts'
import { formatPostDate } from '@/lib/groups/post-date'
import { ANNOUNCE_ANCHOR } from './announce-anchor'
import { announcementAnchor } from './announcement-anchor'
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
}

interface EditInput {
  postId: string
  body: string
  startsAt?: string | null
  endsAt?: string | null
  locationId?: string | null
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

  // bug #211 — arrive on the announcement you tapped, not on the top of a Page
  // with a compose box where you expected it. Shared with the signed-out list
  // (F093), because an `#announcement-<id>` link has to land the same way on
  // both and two copies of the effect is how they stop doing that.
  const highlighted = useAnnouncementAnchor()

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
      const made = await onCreateLocation(
        w.place.mode === 'address'
          ? {
              label: w.place.selectedAddress!.name,
              address: {
                geographyWkt: `SRID=4326;POINT(${w.place.selectedAddress!.coordinates[0]} ${w.place.selectedAddress!.coordinates[1]})`,
                resolvedAddressText: w.place.selectedAddress!.name,
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
      },
      ...items,
    ])
    setDraft('')
    setWhen(emptyWhenWhere)
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
              ...(editWhen.addingPlace ? { locationLabel: resolved.locationLabel } : {}),
            }
          : p,
      ),
    )
    setEditingId(null)
  }

  return (
    <section id={ANNOUNCE_ANCHOR} className="mt-8 scroll-mt-20" data-testid="page-posts">
      <h2 className="text-lg font-medium">Posts</h2>

      {canPost && (
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
              {busy ? 'Posting…' : 'Post'}
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
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((post) => (
            <li
              key={post.id}
              id={announcementAnchor(post.id)}
              data-testid="page-post"
              // The mark is a ring rather than a background: it says "this
              // one" without restyling the announcement into something that
              // looks like a different kind of thing.
              data-highlighted={highlighted === post.id ? 'true' : undefined}
              className={`card p-3 scroll-mt-24${highlighted === post.id ? ANNOUNCEMENT_MARK : ''}`}
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
                  <p className="whitespace-pre-wrap text-sm text-[var(--color-charcoal-900)]">{post.body}</p>

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
                          setEditingId(post.id)
                          setEditDraft(post.body)
                          setEditWhen(whenWhereFrom(post))
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
                        onClick={() => setConfirmingDelete(post.id)}
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
          ))}
        </ul>
      )}
    </section>
  )
}
