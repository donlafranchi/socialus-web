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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ReportControl } from './ReportControl'
import type { ReportCategory } from '@/lib/reports/categories'
import type { PagePost } from '@/lib/groups/page-posts'
import { TagInput, type TagInputValue } from '@/components/tags/TagInput'
import { isValidTagLabel } from '@/lib/groups/tags'
import { ANNOUNCE_ANCHOR } from './announce-anchor'
import { announcementAnchor, announcementIdFromHash } from './announcement-anchor'
import { useAnnouncementAnchor } from './use-announcement-anchor'
import { SharePageButton } from './SharePageButton'
import { METRO_TIME_ZONE, formatMetroDateTime, formatPostedDate, metroWallTimeToInstant } from '@/lib/metro/metro-time'
import { metroDate } from '@/lib/metro/metro-week'
import { firstOccurrenceDate } from '@/lib/posts/series'
import { RemindMeButton, type RemindActions } from '@/components/reminders/RemindMe'
import { reminderFor, type ViewerReminders } from '@/lib/reminders/viewer-reminders'
import { createLocationAction } from '@/app/_actions/location-actions'
import {
  AnnouncementFields,
  defaultSaleThrough,
  defaultShowUntil,
  emptyWhenWhere,
  shelfDays,
  SERIES_COMPOSER_ON,
  whenDefaults,
  type AnnouncementWhenWhere,
} from './AnnouncementFields'
import { PostKindPicker } from './PostKindPicker'
import { DATE_NEEDED, HEADLINE_MAX, POST_KINDS, SAMPLE_POST_KIND, isPostKind, needsDate, type PostKind } from '@/lib/posts/kinds'
import { cardHeadline, leadLine, venueShow, SAMPLE_PREFIX } from '@/lib/posts/lead-line'
import { postPath } from '@/lib/posts/post-path'
import { pageTimeline } from '@/lib/posts/timeline'
import { Sheet } from '@/components/ui/Sheet'
import { HiddenPhotoNotice } from '@/components/group/HiddenPhotoNotice'
import { PagePhotoPicker } from '@/components/media/PagePhotoPicker'
import { DefaultArt, type ArtKind } from '@/components/cards/DefaultArt'
import { AudienceSwitch, FOLLOWERS_NOT_YET, type Audience } from './AudienceSwitch'
import { PostingSafetyNote } from '@/components/PostingSafetyNote'
import { Toast } from '@/components/Toast'
import { COPY } from '@/lib/copy'
import { AddToCalendarLink } from '@/components/calendar/AddToCalendarLink'
import { isLocationPlaceFieldsComplete } from '@/components/locations/LocationPlaceFields'
import { WonderPanel, type WonderActions } from '@/components/wonders/WonderPanel'
import type { WonderView } from '@/lib/wonders/wonder-view'
import { WONDER_OPTIONS_MAX, WONDER_OPTION_MAX } from '@/lib/wonders/roles'

const BODY_LIMIT = 5000

/** The lead line's kind: the post's own, else (a sample read without one) its sample kind's, so a sample always says Sample. */
const leadKind = (post: Pick<PagePost, 'kind' | 'sampleKind'>): PostKind | undefined =>
  post.kind ?? (post.sampleKind ? SAMPLE_POST_KIND[post.sampleKind] : undefined)
const TRY_AGAIN = "That didn't go through. Mind trying again?"
/** F072 § Not this rules out all-day announcements, so a date with no time has
 *  nothing to become. Said as a sentence rather than refused silently. */
const HALF_A_TIME = 'Add both a date and a time, or leave them both empty.'
// #262 — placeholders ([public-is-draft]).
const END_NEEDS_START = 'Add a date and a start time before an end time.'
const PICK_A_DAY = 'Pick at least one day.'
const SERIES_ENDED = 'The end comes before the first one.'
const END_BEFORE_START = 'The end time is before it starts.'

type CreateLocation = typeof createLocationAction

interface PostInput {
  groupId: string
  body: string
  startsAt?: string | null
  endsAt?: string | null
  showUntil?: string | null
  locationId?: string | null
  howToFind?: string | null
  tags?: string[]
  /** F099 — one photo of its own, or none. */
  photoUrl?: string | null
  /** F074.1 — weekly on chosen weekdays; this post is the first occurrence. */
  series?: { weekdays: number[]; startsOn: string | null; endsOn: string | null }
  /** F117 — a Wonder: a threshold and optional sizes. */
  wonder?: { threshold: number; options?: string[] }
  /** plan #230 — what it is, and its one line. */
  kind?: PostKind
  headline?: string
}

/** plan #230 — the when fields as a kind needs them: a sale starts on a week, a dated kind on the next hour. */
function whenForKind(prev: PostKind, next: PostKind, w: AnnouncementWhenWhere, now: Date): AnnouncementWhenWhere {
  if (next === 'sale') return prev === 'sale' ? w : { ...w, endDate: defaultSaleThrough(now) }
  const out = prev === 'sale' ? { ...w, endDate: '' } : w
  if ((next === 'event' || next === 'reminder') && !out.date && !out.repeat.open) return { ...out, ...whenDefaults(now) }
  return out
}

/** Kinds an edit may switch to: a Wonder needs its threshold, so it is neither picked nor left in an edit. */
const EDIT_KINDS = POST_KINDS.filter((k) => k !== 'wonder')

/** F117 — sizes typed with commas between them, distinct and trimmed. */
const splitOptions = (raw: string) => [...new Set(raw.split(',').map((o) => o.trim().slice(0, WONDER_OPTION_MAX)).filter(Boolean))].slice(0, WONDER_OPTIONS_MAX)

/** F117 — what a Wonder shows before the server has a view of it: nobody in yet. */
const freshWonder = (w: { threshold: number; options: string[] }, manages: boolean): WonderView => ({
  total: 0,
  threshold: w.threshold,
  options: w.options,
  mine: null,
  myOffers: [],
  helpers: [],
  ...(manages ? { byOption: w.options.map((option) => ({ option, count: 0 })), people: [], offers: [] } : {}),
})

interface EditInput {
  postId: string
  body: string
  startsAt?: string | null
  endsAt?: string | null
  showUntil?: string | null
  locationId?: string | null
  tags?: string[]
  /** F099 — absent leaves the photo alone; null removes it. */
  photoUrl?: string | null
  kind?: PostKind
  headline?: string
}

interface Props {
  groupId: string
  /** F078 — reporting a Post. Offered to everyone who does not manage the Page. */
  onReport?: (input: { subjectId: string; category: ReportCategory; body: string }) => Promise<{ ok: true } | { ok: false; message: string }>
  loggedIn?: boolean
  returnTo?: string
  posts: PagePost[]
  canPost: boolean
  /** How many people get updates from this Page. Owner-only; see
   *  countPageFollowers for why it is a count and never a roster. */
  followerCount?: number
  /** #337 — a private Page's posts are for its members, so there is no reach to choose. */
  isPrivate?: boolean
  /** F099 — the signed-in member whose folder a post photo is uploaded to. Without one, no photo control. */
  memberId?: string | null
  /** F099 — the Page's name, and its kind's placeholder: what a post without a photo of its own shows. */
  pageName?: string
  /** F099 — the Page picture, resolved (null when none, hidden or removed). */
  pictureUrl?: string | null
  artKind?: ArtKind | null
  /** F099 criterion 8 — a visitor may report the image on a post card: its own photo, or the Page picture. */
  report?: {
    loggedIn: boolean
    returnTo?: string
    onSend: (input: {
      subjectId: string
      subjectKind: 'page_picture' | 'post_photo'
      category: ReportCategory
      body: string
    }) => Promise<{ ok: true } | { ok: false; message: string }>
  }
  /** F074.1 — offer the weekly repeat in the composer (off until its occurrences exist). */
  seriesComposer?: boolean
  /** #945 — Remind me on a real dated post, for a visitor who does not manage the Page. */
  reminders?: { viewer: ViewerReminders } & RemindActions
  /** F117 — each Wonder's view for this viewer, and what its controls call. */
  wonders?: { views: Record<string, WonderView> } & WonderActions
  onPost: (input: PostInput) => Promise<
    { ok: true; data: { postId: string; createdAt: string } } | { ok: false; message: string; code: string }
  >
  onEdit: (input: EditInput) => Promise<
    { ok: true; data: { postId: string; reposted?: boolean } } | { ok: false; message: string; code: string }
  >
  onCreateLocation?: CreateLocation
  /** The form opens from the owner's Announce (#announce); tests start with it open. */
  startComposing?: boolean
  /** #318 — soft delete, after a confirm. */
  onDelete?: (input: { postId: string }) => Promise<
    { ok: true; data: { postId: string } } | { ok: false; message: string; code: string }
  >
  /** Don, 2026-10-31 — the Page's address: each post gets Share, to its own address under it. None on a draft. */
  pagePath?: string | null
  /** The post a post's own address names: the list lands on it. */
  focusPostId?: string | null
}

/** `yyyy-mm-dd` and `hh:mm` back out of an instant, for an edit form that has
 *  to start from what is already there. */
function whenWhereFrom(post: PagePost): AnnouncementWhenWhere {
  if (post.kind === 'sale' && post.startsAt) {
    const through = post.endsAt ?? new Date(new Date(post.startsAt).getTime() + 7 * 86_400_000).toISOString()
    return { ...emptyWhenWhere, endDate: metroDate(new Date(through), METRO_TIME_ZONE) }
  }
  if (!post.startsAt) {
    const own = post.showUntil ? metroDate(new Date(post.showUntil), METRO_TIME_ZONE) : ''
    return { ...emptyWhenWhere, showUntil: own === defaultShowUntil(new Date(post.createdAt), shelfDays(post.kind)) ? '' : own }
  }
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
    endDate: post.endsAt && metroDate(new Date(post.endsAt), METRO_TIME_ZONE) !== `${at('year')}-${at('month')}-${at('day')}` ? metroDate(new Date(post.endsAt), METRO_TIME_ZONE) : '',
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
  onReport,
  loggedIn = false,
  returnTo,
  posts,
  canPost,
  followerCount = 0,
  isPrivate = false,
  memberId = null,
  pageName = '',
  pictureUrl = null,
  artKind = null,
  report,
  onPost,
  onEdit,
  onCreateLocation = createLocationAction,
  onDelete,
  startComposing = false,
  seriesComposer = SERIES_COMPOSER_ON,
  reminders,
  wonders,
  pagePath = null,
  focusPostId = null,
}: Props) {
  const [items, setItems] = useState<PagePost[]>(posts)
  const [draft, setDraft] = useState('')
  // plan #230 — the kind, picked first (News to start, as Google Business Profile's "Add update" does), and the headline.
  const [kind, setKind] = useState<PostKind>('news')
  const [headline, setHeadline] = useState('')
  const [editKind, setEditKind] = useState<PostKind>('news')
  const [editHeadline, setEditHeadline] = useState('')
  const [when, setWhen] = useState<AnnouncementWhenWhere>(emptyWhenWhere)
  const [audience, setAudience] = useState<Audience>('anyone')
  const [photo, setPhoto] = useState<string | null>(null)
  // F117 — the composer's Wonder (the Count me in kind): how many, and the sizes.
  const asWonder = kind === 'wonder'
  const [threshold, setThreshold] = useState('')
  const [options, setOptions] = useState('')
  const [editPhoto, setEditPhoto] = useState<string | null>(null)
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
  // plan #230 (Don, 10-31) — a timeline anchored at now: the past a tap away above, coming up below.
  const { past, latest, upcoming } = pageTimeline(items)
  const [showEarlier, setShowEarlier] = useState(false)
  const nowRef = useRef<HTMLDivElement>(null)
  const nowTop = useRef<number | null>(null)
  // Opening the past grows the column upward: the now marker stays where it was, and the past is a scroll up.
  useLayoutEffect(() => {
    if (nowTop.current === null || !nowRef.current) return
    window.scrollBy(0, nowRef.current.getBoundingClientRect().top - nowTop.current)
    nowTop.current = null
  }, [showEarlier])
  const toggleEarlier = () => {
    nowTop.current = nowRef.current?.getBoundingClientRect().top ?? null
    setShowEarlier(!showEarlier)
  }
  // A link to a past post opens Earlier, so the post it names is there to land on.
  useEffect(() => {
    const id = announcementIdFromHash(window.location.hash) ?? focusPostId
    if (!id || !pageTimeline(posts).past.some((p) => p.id === id)) return
    const frame = requestAnimationFrame(() => setShowEarlier(true))
    return () => cancelAnimationFrame(frame)
  }, [posts, focusPostId])
  const highlighted = useAnnouncementAnchor(showEarlier, focusPostId)
  // #472 first pass — the form is rarely used, so it waits for Announce
  // (Google Business Profile's "Add update" opens on request).
  const [composing, setComposing] = useState(startComposing)
  const [postedToast, setPostedToast] = useState(false)
  const hidePostedToast = useCallback(() => setPostedToast(false), [])
  useEffect(() => {
    if (!canPost) return
    const open = () => {
      if (window.location.hash !== `#${ANNOUNCE_ANCHOR}`) return
      // #1094 — the ➕ sheet arrives with the chosen kind already picked.
      const composeKind = new URLSearchParams(window.location.search).get('compose')
      requestAnimationFrame(() => {
        setComposing(true)
        if (isPostKind(composeKind)) {
          setWhen((w) => whenForKind('news', composeKind, w, new Date()))
          setKind(composeKind)
        }
      })
    }
    open()
    // A tap on the Announce link while already on the Page changes the fragment with
    // pushState, which fires no hashchange: the tap itself has to open the form (#547).
    const tapped = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a')
      if (link?.getAttribute('href')?.endsWith(`#${ANNOUNCE_ANCHOR}`)) requestAnimationFrame(() => setComposing(true))
    }
    window.addEventListener('hashchange', open)
    document.addEventListener('click', tapped)
    return () => {
      window.removeEventListener('hashchange', open)
      document.removeEventListener('click', tapped)
    }
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
    postKind: PostKind,
    /** A sale being edited keeps the moment it started; a new one starts now. */
    saleStart?: string | null,
  ): Promise<
    | {
        ok: true
        startsAt: string | null
        endsAt: string | null
        showUntil: string | null
        locationId: string | null
        locationLabel: string | null
        series?: NonNullable<PostInput['series']>
      }
    | { ok: false; message: string }
  > {
    // plan #230 — a sale runs from now (or when it started) through the end of the day it ends.
    if (postKind === 'sale' && !w.endDate) return { ok: false, message: DATE_NEEDED.sale }
    // F074.1 — a series has no date of its own: the first occurrence is the first chosen weekday on or
    // after today (and the start date), and the creator never types an individual date.
    const repeating = postKind !== 'sale' && seriesComposer && w.repeat.open
    if (repeating && w.repeat.days.length === 0) return { ok: false, message: PICK_A_DAY }
    const date = repeating ? firstOccurrenceDate(w.repeat.days, w.repeat.startsOn || null, metroDate(new Date(), METRO_TIME_ZONE)) : w.date
    if (repeating && w.repeat.endsOn && w.repeat.endsOn < date) return { ok: false, message: SERIES_ENDED }
    const hasDate = postKind !== 'sale' && date.trim().length > 0
    const hasTime = postKind !== 'sale' && w.time.trim().length > 0
    if (needsDate(postKind) && postKind !== 'sale' && !hasDate && !hasTime) return { ok: false, message: DATE_NEEDED[postKind as 'event' | 'reminder'] }
    if (repeating ? !hasTime : hasDate !== hasTime) return { ok: false, message: HALF_A_TIME }

    let startsAt: string | null = postKind === 'sale' ? (saleStart ?? new Date().toISOString()) : null
    if (hasDate && hasTime) {
      startsAt = metroWallTimeToInstant(date, w.time)
      if (!startsAt) return { ok: false, message: HALF_A_TIME }
    }

    let endsAt: string | null = null
    // #814 — the end can fall on a later day; an end day with no end time runs to the end of that day.
    const endDay = !repeating && w.endDate.trim() ? w.endDate : date
    const endClock = postKind === 'sale' ? '23:59' : w.endTime.trim() || (endDay !== date ? '23:59' : '')
    if (endClock) {
      if (!startsAt) return { ok: false, message: END_NEEDS_START }
      endsAt = metroWallTimeToInstant(endDay, endClock)
      if (!endsAt || new Date(endsAt) <= new Date(startsAt)) return { ok: false, message: END_BEFORE_START }
    }

    // #314 — an undated post shows through the end of the day its owner picked; none is the 14-day default.
    const showUntil = !startsAt && w.showUntil ? metroWallTimeToInstant(w.showUntil, '23:59') : null

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

    return {
      ok: true,
      startsAt,
      endsAt,
      showUntil,
      locationId,
      locationLabel,
      ...(repeating ? { series: { weekdays: w.repeat.days, startsOn: w.repeat.startsOn || null, endsOn: w.repeat.endsOn || null } } : {}),
    }
  }

  const chooseKind = (k: PostKind) => {
    setWhen((w) => whenForKind(kind, k, w, new Date()))
    setKind(k)
  }
  const chooseEditKind = (k: PostKind) => {
    setEditWhen((w) => whenForKind(editKind, k, w, new Date()))
    setEditKind(k)
  }

  const submit = async () => {
    // plan #230 — a headline alone is a whole post; its details default to it.
    const line = headline.trim()
    const body = draft.trim() || line
    if (!body || busy) return
    // The restricted setting is visible and not postable: delivery to the
    // people who get updates from you does not exist, and an announcement
    // addressed to forty-two people none of whom receive it is a lie.
    if (audience !== 'anyone') {
      setError(FOLLOWERS_NOT_YET)
      return
    }
    const goal = Number(threshold)
    if (asWonder && !(Number.isInteger(goal) && goal >= 1)) {
      setError(COPY.wonderThresholdInvalid)
      return
    }
    const wonder = asWonder ? { threshold: goal, options: splitOptions(options) } : null
    setBusy(true)
    setError(null)

    const resolved = await resolveWhenWhere(when, kind)
    if (!resolved.ok) {
      setBusy(false)
      setError(resolved.message)
      return
    }

    const r = await onPost({
      ...(wonder ? { wonder } : {}),
      groupId,
      kind,
      ...(line ? { headline: line } : {}),
      body,
      startsAt: resolved.startsAt,
      endsAt: resolved.endsAt,
      showUntil: resolved.showUntil,
      locationId: resolved.locationId,
      ...(when.addingPlace ? { howToFind: when.howToFind } : {}),
      tags: tagSet(tags),
      ...(photo ? { photoUrl: photo } : {}),
      ...(resolved.series ? { series: resolved.series } : {}),
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
        showUntil: resolved.showUntil,
        locationLabel: resolved.locationLabel,
        howToFind: when.addingPlace && when.howToFind.trim() ? when.howToFind.trim() : null,
        tags: tagSet(tags),
        photoUrl: photo,
        kind,
        headline: line || null,
        ...(wonder ? { wonder } : {}),
      },
      ...items,
    ])
    setKind('news')
    setHeadline('')
    setThreshold('')
    setOptions('')
    setPhoto(null)
    setDraft('')
    setWhen(emptyWhenWhere)
    setTags({ tags: [], draft: '' })
    setPostedToast(true)
  }

  const saveEdit = async (postId: string) => {
    const body = editDraft.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)

    const before = items.find((p) => p.id === postId)
    const resolved = await resolveWhenWhere(editWhen, editKind, before?.kind === 'sale' ? before.startsAt : null)
    if (!resolved.ok) {
      setBusy(false)
      setError(resolved.message)
      return
    }
    const line = editHeadline.trim()

    const r = await onEdit({
      postId,
      body,
      ...(before?.kind === 'wonder' ? {} : { kind: editKind }),
      ...(line ? { headline: line } : {}),
      startsAt: resolved.startsAt,
      endsAt: resolved.endsAt,
      // #314 — a dated post clears it in the handler; an undated one sends its day, or null for the default.
      ...(resolved.startsAt ? {} : { showUntil: resolved.showUntil }),
      // An edit that did not open the address control leaves the address
      // alone. `undefined` is "don't touch"; `null` would be "remove".
      ...(editWhen.addingPlace ? { locationId: resolved.locationId } : {}),
      tags: tagSet(editTags),
      // Only a changed photo is sent: absent leaves it, null removes it.
      ...(editPhoto !== (items.find((p) => p.id === postId)?.photoUrl ?? null) ? { photoUrl: editPhoto } : {}),
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
              showUntil: resolved.startsAt ? null : resolved.showUntil,
              tags: tagSet(editTags),
              kind: p.kind === 'wonder' ? p.kind : editKind,
              headline: line || p.headline,
              // F102: a hidden post the edit reposted shows again at once.
              ...(r.data.reposted ? { hiddenAt: null } : {}),
              ...(editWhen.addingPlace ? { locationLabel: resolved.locationLabel } : {}),
              photoUrl: editPhoto,
            }
          : p,
      ),
    )
    setEditingId(null)
  }

  const renderPost = (post: PagePost) => (
            <li
              key={post.id}
              id={announcementAnchor(post.id)}
              data-testid="page-post"
              // #796 — the tapped post is scrolled into view; no ring (it was clipped to two sides in the strip).
              data-highlighted={highlighted === post.id ? 'true' : undefined}
              className="card border border-[var(--color-border)] p-3 scroll-mt-24"
            >
              {editingId === post.id ? (
                <div className="flex flex-col gap-3">
                  {post.kind !== 'wonder' && <PostKindPicker value={editKind} onChange={chooseEditKind} idPrefix={`page-post-edit-${post.id}`} kinds={EDIT_KINDS} />}
                  <HeadlineField id={`edit-headline-${post.id}`} testId="page-post-edit-headline" value={editHeadline} onChange={setEditHeadline} />
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
                    postedAt={new Date(post.createdAt)}
                    kind={post.kind === 'wonder' ? 'wonder' : editKind}
                  />
                  <TagInput idPrefix="announce-edit-tag" label="Tags (optional)" value={editTags} onChange={setEditTags} />
                  {memberId && (
                    <PagePhotoPicker
                      memberId={memberId}
                      value={editPhoto}
                      onChange={setEditPhoto}
                      label="Photo (optional)"
                      previewAlt="The photo on this post"
                    />
                  )}
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
                  {/* F099 criterion 6 — exactly one image on every post card:
                      its own photo, else the Page picture,
                      else the kind's placeholder. Alt: the owner's words (the
                      post's first line); the placeholder's is the Page's name. */}
                  <div className="relative mb-2 h-32 w-full overflow-hidden rounded-md">
                    {post.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.photoUrl}
                        alt={post.body.split('\n')[0].slice(0, 120)}
                        className="h-full w-full object-cover"
                      />
                    ) : pictureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pictureUrl} alt={pageName || 'Page'} className="h-full w-full object-cover" />
                    ) : (
                      <div role="img" aria-label={pageName || 'Page'} className="h-full w-full">
                        <DefaultArt kind={artKind} />
                      </div>
                    )}
                    {/* F099 criterion 8 — each image is reportable on its own. A
                        placeholder is no one's picture, so there is nothing to report. */}
                    {report && !canPost && (post.photoUrl || pictureUrl) && (
                      <div className="absolute right-1 top-1 rounded-full bg-white/90">
                        <ReportControl
                          subjectId={post.photoUrl ? post.id : groupId}
                          subjectKind={post.photoUrl ? 'post_photo' : 'page_picture'}
                          subjectLabel={post.photoUrl ? 'this photo' : 'this picture'}
                          itemLabel="Report this photo"
                          loggedIn={report.loggedIn}
                          returnTo={report.returnTo}
                          onSend={report.onSend as never}
                        />
                      </div>
                    )}
                  </div>
                  {canPost && post.photoHidden && (
                    <div className="mb-2">
                      <HiddenPhotoNotice which="post" />
                    </div>
                  )}
                  {/* plan #230 — what it is first: the lead line from its fields, then its one line. #1127: a sample says
                      Sample once, here; no watermark or extra label, and its body keeps the disclaimer. */}
                  {leadKind(post) && (
                    <p data-testid="page-post-lead" className="text-micro font-bold uppercase tracking-wider text-[var(--color-fg)]">
                      {leadLine({ kind: leadKind(post)!, startsAt: post.startsAt, endsAt: post.endsAt, postedAt: post.createdAt, where: post.locationLabel, sample: Boolean(post.sampleKind), show: venueShow({ body: post.body, tags: post.tags ?? [] }) })}
                    </p>
                  )}
                  {post.headline && (
                    <p data-testid="page-post-headline-text" className="mt-0.5 line-clamp-1 text-body font-semibold text-[var(--color-fg)]">
                      {post.headline}
                    </p>
                  )}
                  <p className={`whitespace-pre-wrap text-sm text-[var(--color-charcoal-900)]${leadKind(post) || post.headline ? ' mt-1' : ''}`}>{post.sampleKind && leadKind(post) ? post.body.replace(SAMPLE_PREFIX, '') : post.body}</p>
                  {post.wonder && wonders && (
                    <WonderPanel
                      postId={post.id}
                      view={wonders.views[post.id] ?? freshWonder(post.wonder, canPost)}
                      loggedIn={loggedIn}
                      canManage={canPost}
                      returnTo={returnTo ?? '/'}
                      actions={wonders}
                    />
                  )}

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
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {reminders && !canPost && !post.sampleKind && !post.hiddenAt && (
                        <RemindMeButton
                          postId={post.id}
                          repeats={!!post.seriesId}
                          reminderId={reminderFor(reminders.viewer, post)}
                          loggedIn={loggedIn}
                          returnTo={returnTo ?? '/'}
                          actions={reminders}
                        />
                      )}
                      <AddToCalendarLink
                        uid={`${post.id}@socialus.org`}
                        title={post.body.split('\n')[0].slice(0, 120)}
                        start={post.startsAt}
                        end={post.endsAt}
                        location={post.locationLabel ?? null}
                      />
                      {post.ticketUrl && (
                        <a href={post.ticketUrl} target="_blank" rel="noopener noreferrer" data-testid="page-post-tickets" className="text-sm text-[var(--color-accent)] hover:underline">
                          Tickets
                        </a>
                      )}
                    </div>
                  )}

                  {canPost && post.hiddenAt && (
                    <p className="mt-2 text-sm text-[var(--color-fg-muted)]" data-testid="page-post-hidden">
                      Hidden while we take a look. Nobody else can see it right now.
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-3">
                    <span data-testid="page-post-posted" className="text-xs text-gray-500">{formatPostedDate(post.createdAt)}</span>
                    {pagePath && !post.hiddenAt && (
                      <SharePageButton quiet testId="page-post-share" title={cardHeadline({ headline: post.headline, body: post.body, pageName })} path={postPath(pagePath, post.id)} />
                    )}
                    {!canPost && onReport && (
                      <ReportControl subjectId={post.id} subjectLabel="this post" itemLabel="Report this post" loggedIn={loggedIn} returnTo={returnTo} onSend={onReport} />
                    )}
                    {canPost && (
                      <button
                        type="button"
                        data-testid="page-post-edit"
                        onClick={() => {
                          setEditingId(post.id)
                          setEditDraft(post.body)
                          setEditKind(post.kind ?? 'news')
                          setEditHeadline(post.headline ?? '')
                          setEditWhen(whenWhereFrom(post))
                          setEditTags({ tags: post.tags ?? [], draft: '' })
                          setEditPhoto(post.photoUrl ?? null)
                          setError(null)
                        }}
                        className="inline-flex min-h-tap items-center px-1 text-xs underline"
                      >
                        Edit
                      </button>
                    )}
                    {canPost && onDelete && (
                      <button
                        type="button"
                        data-testid="page-post-delete"
                        onClick={() => {
                          setConfirmingDelete(post.id)
                        }}
                        className="inline-flex min-h-tap items-center px-1 text-xs underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <Sheet
                    open={confirmingDelete === post.id && !!onDelete}
                    title="Delete this post?"
                    description="It comes off your Page and Explore."
                    onClose={() => setConfirmingDelete(null)}
                    testId="page-post-delete-confirm"
                    footer={
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            if (!onDelete) return
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
                    }
                  >
                    <></>
                  </Sheet>
                </>
              )}
              {/* plan #230 — room under each post for what comes later (comments); empty for now. */}
              <div data-testid="page-post-after" />
            </li>
  )

  return (
    <section id={ANNOUNCE_ANCHOR} aria-labelledby="page-posts-title" className="card scroll-mt-20 border border-[var(--color-border)] p-4" data-testid="page-posts" data-section="posts">
      <h2 id="page-posts-title" className="text-title-3 text-[var(--color-fg)]">Posts</h2>

      {canPost && composing && (
        <div className="mt-3 flex flex-col gap-3">
          <PostKindPicker value={kind} onChange={chooseKind} idPrefix="announce" />
          <HeadlineField id="page-post-headline" testId="page-post-headline" value={headline} onChange={setHeadline} />
          <label htmlFor="page-post-body" className="text-body-sm font-medium text-[var(--color-fg)]">
            Details
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

          <div className="flex flex-col gap-2" data-testid="wonder-composer">
            {asWonder && (
              <>
                <p className="text-body-sm text-[var(--color-fg-muted)]">{COPY.wonderComposerNote}</p>
                <label className="flex flex-col gap-1 text-body-sm">
                  {COPY.wonderThreshold}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="min-h-tap w-32 rounded border border-[var(--color-control-border)] px-3"
                  />
                </label>
                <label className="flex flex-col gap-1 text-body-sm">
                  {COPY.wonderOptionsLabel}
                  <input
                    type="text"
                    value={options}
                    placeholder={COPY.wonderOptionsPlaceholder}
                    onChange={(e) => setOptions(e.target.value)}
                    className="min-h-tap rounded border border-[var(--color-control-border)] px-3"
                  />
                </label>
              </>
            )}
          </div>

          <AnnouncementFields value={when} onChange={setWhen} idPrefix="announce" repeats={seriesComposer && kind !== 'sale'} kind={kind} />

          <TagInput idPrefix="announce-tag" label="Tags (optional)" value={tags} onChange={setTags} />
          {memberId && (
            <PagePhotoPicker
              memberId={memberId}
              value={photo}
              onChange={setPhoto}
              label="Photo (optional)"
              previewAlt="The photo on this post"
            />
          )}

          {!isPrivate && (
            <AudienceSwitch
              value={audience}
              onChange={setAudience}
              followerCount={followerCount}
              idPrefix="announce"
            />
          )}

          <PostingSafetyNote />

          <div>
            <button
              type="button"
              data-testid="page-post-send"
              onClick={submit}
              disabled={busy || (draft.trim().length === 0 && headline.trim().length === 0) || audience !== 'anyone'}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? 'Announcing' : asWonder ? COPY.wonderPost : 'Announce'}
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
        <>
          {past.length > 0 && (
            <section data-testid="page-posts-earlier" aria-label="Earlier posts" className="mt-3">
              <button
                type="button"
                aria-expanded={showEarlier}
                onClick={toggleEarlier}
                className="press inline-flex min-h-tap items-center text-body-sm font-semibold text-[var(--color-fg-muted)] underline"
              >
                {showEarlier ? 'Hide earlier posts' : `Earlier posts (${past.length})`}
              </button>
              {showEarlier && <ul className="mt-2 flex flex-col gap-3">{past.map((post) => renderPost(post))}</ul>}
            </section>
          )}
          {(past.length > 0 || upcoming.length > 0) && (
            <div ref={nowRef} data-testid="page-posts-now" className="mt-4 flex items-center gap-3 text-micro font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
              <span aria-hidden="true" className="h-px flex-1 bg-[var(--color-border)]" />
              Now
              <span aria-hidden="true" className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
          )}
          {latest.length > 0 && (
            <ul data-testid="page-posts-latest" aria-label="Latest posts" className="mt-3 flex flex-col gap-3">
              {latest.map((post) => renderPost(post))}
            </ul>
          )}
          {upcoming.length > 0 && (
            <section data-testid="page-posts-upcoming" aria-labelledby="page-posts-upcoming-title" className="mt-6">
              <h3 id="page-posts-upcoming-title" data-testid="page-posts-upcoming-title" className="text-micro font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                Coming up
              </h3>
              <ul className="mt-2 flex flex-col gap-3">{upcoming.map((post) => renderPost(post))}</ul>
            </section>
          )}
        </>
      )}
      <Toast message={COPY.posted} visible={postedToast} onHide={hidePostedToast} />
    </section>
  )
}

/** plan #230 — the card's one line, at most 60 characters, with a count. Draft copy (human-review). */
function HeadlineField({ id, testId, value, onChange }: { id: string; testId: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-body-sm font-medium text-[var(--color-fg)]">
          Headline
        </label>
        <span data-testid={`${testId}-count`} aria-live="polite" className="text-caption text-[var(--color-fg-muted)]">
          {value.length}/{HEADLINE_MAX}
        </span>
      </div>
      <input
        id={id}
        type="text"
        data-testid={testId}
        value={value}
        maxLength={HEADLINE_MAX}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Free tasting of the fall lineup"
        className="min-h-tap w-full rounded border border-[var(--color-control-border)] px-3 text-sm"
      />
    </div>
  )
}
