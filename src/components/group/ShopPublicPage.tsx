// T074 — Public Shop page presentational component (F035 read surface).
// Spec: planning/now/scenario-F035-rosa-finds-mayas-shop.md story beats 1–6.
//
// Presentational + server-renderable. Data fetching lives in the route
// (src/app/p/[...slug]/page.tsx); this component renders the resolved shape so
// it stays unit-testable. The client islands are <FollowPageButton> and
// <ReportControl>.

import { BeforeYouPublish } from '@/components/create/BeforeYouPublish'
import { publishDraftAction } from '@/app/create/actions'
import { DRAFT_NAME_PLACEHOLDER } from '@/actions/group/constants'
import { OwnerPanel } from './OwnerPanel'
import { PageEditorProvider } from './edit/PageEditor'
import { savedPinFrom, whereValueFrom } from '@/components/locations/where-save'
import { editPageAction } from '@/app/g/[handle]/edit/actions'
import { DefaultArt, artKindFor } from '@/components/cards/DefaultArt'
import { TagChips } from '@/components/tags/TagChips'
import { PageContactBlock } from './PageContactBlock'
import { fixedPlacement, whereLine, whereNow, type PageWhere } from '@/lib/groups/page-where'
import type { PageContact } from '@/lib/groups/page-contact'
import type { ResolvedShop, ShopItem, LocalOwnerBadge, OwnerClaim } from '@/lib/groups/resolve-shop'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { FollowPageButton } from './FollowPageButton'
import { ReportControl } from './ReportControl'
import { OwnerBar } from './OwnerBar'
import { HiddenPhotoNotice } from './HiddenPhotoNotice'
import { contactLinksForDisplay, isSafeLinkUrl, type ContactLinks } from '@/lib/groups/social-links'

const NO_LINKS: ContactLinks = { website: null, socials: [] }
import { sendReportAction, sendPostReportAction } from '@/app/_actions/report-actions'
import { followPageAction, unfollowPageAction } from '@/app/_actions/page-follow-actions'
import { PagePosts } from './PagePosts'
import { NO_REMINDERS, type ViewerReminders } from '@/lib/reminders/viewer-reminders'
import { RemindEveryTimeButton } from '@/components/reminders/RemindMe'
import { setReminderAction, removeReminderAction, remindEveryTimeForPageAction } from '@/app/_actions/reminder-actions'
import { WithheldPagePosts } from './WithheldPagePosts'
import { postToPageAction, editPagePostAction, deletePagePostAction } from '@/app/_actions/page-post-actions'
import type { PagePost } from '@/lib/groups/page-posts'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import { SharePageButton } from './SharePageButton'
import { NextUp } from './NextUp'
import { MapPin, Store, Users } from 'lucide-react'
import { kindLine, pageKindOf, pageLayoutFor, purposeOf, type Purpose } from '@/lib/groups/page-kind'
import { componentOn, isBusinessKind } from '@/lib/groups/page-components'
import { UnclaimedBox } from './UnclaimedBox'
import { requestUnclaimedClaimAction, requestUnclaimedRemovalAction } from '@/app/_actions/unclaimed-actions'
import { COPY } from '@/lib/copy'
import { LocallyOwnedClaim } from './LocallyOwnedClaim'
import { LocalOwnerClaimProvider, LocalOwnerBadgeChip } from './LocalOwnerClaimState'
import { setJurisdictionAction, removeJurisdictionAction } from '@/app/p/[...slug]/claim-actions'
import { SHOW_OPENING_HOURS } from '@/lib/features'
import { PageSection } from './PageSection'
import { AboutText } from './AboutText'
import { PageMap } from './PageMap'
import { PageStops } from './PageStops'
import { SearchDemandCard } from './SearchDemandCard'
import type { PageSearchDemand } from '@/lib/search/page-demand'
import { pageMapView } from '@/lib/groups/page-map'
import { FeaturedItems } from './FeaturedItems'
import { saveFeaturedItemAction, removeFeaturedItemAction } from '@/app/_actions/featured-item-actions'


const NO_CLAIM = { zip: null, isProximal: false }

interface Props {
  shop: ResolvedShop
  /** #353 — the unclaimed box's writes; the demo page passes stand-ins. */
  unclaimedActions?: {
    claim: typeof requestUnclaimedClaimAction
    remove: typeof requestUnclaimedRemovalAction
  }
  badge: LocalOwnerBadge | null
  items: ShopItem[]
  loggedIn: boolean
  /** T097 (F037) — the acting owner's claim state; null for non-owners / anon
   *  (the owner-only management widget renders only when this is non-null). */
  ownerClaim?: OwnerClaim | null
  /** T160 (F058) — gates the hidden-photo notice. Owners only; a non-owner
   *  sees exactly what a Page with no photo shows. */
  viewerOwnsPage?: boolean
  /** T160 — where to come back to after a signed-out member signs in. */
  pagePath?: string
  /** F067 — whether the viewer already follows or belongs to this Page. */
  viewerFollows?: boolean
  /** bug #338 — their row is a membership, not a follow. */
  viewerIsMember?: boolean
  /** F072 — what this Page has said, newest first. RLS decides what is in
   *  here; the owner's own drafts-of-a-draft-Page come back for the owner. */
  posts?: PagePost[]
  /** F093 — the signed-out form. Never populated at the same time as `posts`. */
  withheldPosts?: BrowseResult[]
  /** F072 — how many people get updates from this Page. Owner-only; the
   *  composer is the only thing that renders it. */
  followerCount?: number
  /** #945 — the viewer's own reminders; absent for an owner or a visitor. */
  reminders?: ViewerReminders
  /** #301 — a draft's tag count, for its owner's publish checklist. */
  draftTagCount?: number
  /** #302 — the owner's in-place editor (Don, 2026-10-04). */
  viewerMemberId?: string | null
  contactOn?: boolean
  /** #363 — Products & services: on for a business, added by any other Page. */
  productsOn?: boolean
  /** #316 — the Page's tags; empty signed out. */
  tags?: string[]
  /** #293 — phone and hours. The front door shows neither (F093 criterion 8). */
  contact?: PageContact | null
  /** #348 — where it is. The front door shows none of it (F093 criterion 8). */
  where?: PageWhere | null
  /** #909 — what locals near the Page searched this month (3+ searches). Owner-only. */
  searchDemand?: PageSearchDemand | null
}

// Don, 2026-10-04: an unnamed draft is called what Create asked about.
const DRAFT_HEADING: Record<Purpose, string> = { sell: 'business', offer: 'class or service', gather: 'group or meetup', create: '' }

export function ShopPublicPage({
  shop,
  badge,
  items,
  loggedIn,
  ownerClaim = null,
  viewerOwnsPage = false,
  pagePath,
  viewerFollows = false,
  viewerIsMember = false,
  posts = [],
  tags = [],
  contact = null,
  where = null,
  withheldPosts = [],
  followerCount = 0,
  reminders = NO_REMINDERS,
  draftTagCount = 0,
  unclaimedActions,
  viewerMemberId = null,
  contactOn = false,
  productsOn = componentOn(shop.kind, null, 'products'),
  searchDemand = null,
}: Props) {
  const isDraftPreview = shop.lifecycleState === 'draft'
  const layout = pageLayoutFor(shop.kind)
  // #945 — the weekly series this Page's real, dated posts belong to: following it offers Remind me every time.
  const repeatingSeries = [...new Set(posts.filter((p) => p.seriesId && p.startsAt && !p.sampleKind && !p.hiddenAt).map((p) => p.seriesId!))]

  // T160 — the hide, as every surface must read it. `visiblePhotoUrl()` is the
  // single place `photo_hidden_at` is consulted; nothing here reads
  // `shop.photoUrl` directly, which is what keeps a hide a hide.
  const photoUrl = visiblePhotoUrl({
    photo_url: shop.photoUrl,
    photo_hidden_at: shop.photoHiddenAt,
    photo_removed_at: shop.photoRemovedAt,
  })
  // Only the owner is told. Everyone else sees what a photoless Page shows —
  // today nothing, and T146's default art once that lands. Neither reveals
  // that a photo exists, or that anyone reported it.
  const showHiddenNotice = viewerOwnsPage && photoUrl === null && shop.photoHiddenAt !== null
  // F099 — and the Page picture, named as such.
  const showPictureNotice = viewerOwnsPage && shop.pictureUrl == null && !!shop.pictureHiddenAt
  const showOwnerPanel = viewerOwnsPage && Boolean(pagePath)
  // F093 criterion 8 — signed out is the front door: name, photo, description,
  // the withheld card and Sign up to follow. Listings and links out wait.
  const contactLinks = loggedIn ? contactLinksForDisplay(shop.socialLinks, shop.unclaimed?.publicInfoUrl) : NO_LINKS

  const placement = fixedPlacement(where, shop.placements[0])
  const how = loggedIn && where ? whereLine(where) : null
  // #896 — an area-only Page gets the area, never its point; a Page that moves, no map (#894).
  const mapView = loggedIn ? pageMapView(shop.placements[0], where?.mode ?? null, shop.displayName) : null
  const stops = loggedIn && (where?.mode === 'multi' || where?.mode === 'roaming') ? (where.stops ?? []) : []
  // #896 — Don, 2026-10-18: an area-only Page has no map, but a line says where it is.
  const area = shop.placements[0]
  const areaLine = loggedIn && !mapView && area?.kind === 'area' && (!where?.mode || where.mode === 'visit') && area.label.trim() ? `In ${area.label.trim()}` : null
  const hasContact = loggedIn && Boolean(contact?.phone || (SHOW_OPENING_HOURS && contact?.hours) || contactLinks.website || contactLinks.socials.length)
  const showFound = loggedIn && tags.length > 0
  // bug #338 — a member's row is membership, not a follow, so nothing offers to undo it.
  const memberOfOpenPage = viewerIsMember && shop.discoverability !== 'private'
  // #363 — off for a social group until its owner adds it (bug #341).
  // #909 — empty, it is the owner's prompt and nobody else's.
  const showProducts = loggedIn && productsOn && (items.length > 0 || viewerOwnsPage)
  const draftHeading = DRAFT_HEADING[purposeOf(shop.kind, shop.purpose)]

  const page = (
    // #806 — the claim card and the badge share the claim, so a save updates both.
    <LocalOwnerClaimProvider claim={ownerClaim ?? NO_CLAIM} badge={badge}>
    {/* #300 — T2 Detail: a centred read-width column; from 1024 the owner's
        panel sits beside it (720 + 48 + 360 inside the 1128 detail width). */}
    <main
      className={
        showOwnerPanel
          ? 'mx-auto w-full max-w-detail gutter py-6 pb-nav lg:grid lg:grid-cols-[minmax(0,var(--container-read))_var(--panel-w)] lg:gap-12'
          : 'mx-auto w-full max-w-read gutter py-6 pb-nav'
      }
    >
     <div className="flex min-w-0 flex-col gap-4">
      {/* #301 — a draft is finished here, on the Page, not in a walkthrough. */}
      {isDraftPreview && (
        <div data-testid="shop-draft-banner" role="status" className="text-caption font-medium text-[var(--color-fg-muted)]">
          Draft · only you can see this
        </div>
      )}

      {/* #423 — archived: only the people who manage it reach it. Copy is a placeholder ([public-is-draft]). */}
      {shop.lifecycleState === 'archived' && (
        <div data-testid="shop-archived-banner" role="status" className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-body-sm font-medium text-[var(--color-fg)]">
          Archived · Only you can see this
        </div>
      )}

      {showHiddenNotice && <HiddenPhotoNotice />}
      {showPictureNotice && <HiddenPhotoNotice which="picture" />}

      {/* #458 — the header block: photo, name, kind, Share and Follow. */}
      <header data-testid="page-header" className="flex flex-col gap-3">
        {/* #300 — the cover: the photo, or the default art when there is none or
            it is hidden. Decorative: the name is right under it. */}
        <div data-testid="page-cover" className="aspect-[2/1] overflow-hidden rounded-lg md:aspect-[3/1]">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <DefaultArt kind={artKindFor(shop.kind, shop.purpose)} />
          )}
        </div>
        {/* #353 — a picture from their own site is credited and linked. */}
        {photoUrl && shop.unclaimed?.photoCredit && (
          <p data-testid="photo-credit" className="-mt-2 text-caption text-[var(--color-fg-muted)]">
            Photo:{' '}
            {shop.unclaimed.photoSourceUrl ? (
              <a href={shop.unclaimed.photoSourceUrl} rel="noopener nofollow" target="_blank" className="underline">
                {shop.unclaimed.photoCredit}
              </a>
            ) : (
              shop.unclaimed.photoCredit
            )}
          </p>
        )}

        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 data-testid="shop-name" className="text-title-1 md:text-title-1-lg">
                {isDraftPreview && shop.displayName === DRAFT_NAME_PLACEHOLDER
                  ? `Your new ${draftHeading ? `${draftHeading} ` : ''}Page`
                  : shop.displayName}
              </h1>
              {isBusinessKind(shop.kind) && <LocalOwnerBadgeChip />}
              {/* #353 — a neutral tag after the name (Yelp's placement). */}
              {shop.unclaimed && (
                <span data-testid="unclaimed-label" className="chip whitespace-nowrap text-xs">
                  {COPY.unclaimedLabel}
                </span>
              )}
            </div>
            <p data-testid="page-kind" className="flex items-center gap-1.5 text-body-sm text-[var(--color-fg-muted)]">
              {pageKindOf(shop.kind) === 'business' ? <Store size={14} aria-hidden="true" /> : <Users size={14} aria-hidden="true" />}
              {kindLine(shop.kind, shop.purpose, shop.category)}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center">
            {/* #409 — anyone can share a published Page, signed in or out. */}
            {!isDraftPreview && pagePath && <SharePageButton title={shop.displayName} path={pagePath} />}
            {/* #267 — not on your own Page. A signed-out member is sent to sign-in (T160). */}
            {!viewerOwnsPage && (
              <ReportControl subjectId={shop.groupId} subjectLabel={shop.displayName} loggedIn={loggedIn} returnTo={pagePath} onSend={sendReportAction} wordsReportable={!shop.wordsHidden} />
            )}
          </div>
        </div>

        {/* #625 — owner only: a report hid this Page's name and description from everyone else. */}
        {shop.wordsHidden && viewerOwnsPage && (
          <p data-testid="page-words-hidden-note" role="status" className="mt-3 rounded-lg bg-[var(--color-surface-muted,#f1f5f9)] px-3 py-2 text-body-sm text-[var(--color-fg)]">
            {COPY.pageWordsHiddenNote}
          </p>
        )}

        {/* Owner only, and absent from the markup for everyone else — this
            component is not rendered at all unless the server resolved
            ownership. The writes behind it re-check the managing role. */}
        {isDraftPreview && viewerOwnsPage && pagePath ? (
          <BeforeYouPublish
            editPath={`${pagePath}/edit`}
            hasName={shop.displayName !== DRAFT_NAME_PLACEHOLDER && shop.displayName.trim() !== ''}
            hasPlace={Boolean(shop.anchorLocationId)}
            hasDescription={shop.publicDescription.trim() !== ''}
            hasTags={draftTagCount > 0}
            hasPhoto={Boolean(photoUrl)}
            onPublish={publishDraftAction.bind(null, shop.groupId)}
          />
        ) : null}

        {viewerOwnsPage && pagePath && !isDraftPreview ? (
          <div className="lg:hidden">
            <OwnerBar pagePath={pagePath} />
          </div>
        ) : null}

        {/* #267 — not on your own Page: your row there is your authority, not a follow. */}
        {!viewerOwnsPage &&
          (memberOfOpenPage ? (
            <span data-testid="viewer-member" className="chip self-start whitespace-nowrap text-xs">
              Member
            </span>
          ) : (
            <div>
              <FollowPageButton
                groupId={shop.groupId}
                isPrivate={shop.discoverability === 'private'}
                join={layout.lead === 'join'}
                loggedIn={loggedIn}
                following={viewerFollows}
                returnTo={pagePath}
                onFollow={followPageAction}
                onUnfollow={unfollowPageAction}
                whenFollowing={
                  repeatingSeries.length > 0 ? (
                    <RemindEveryTimeButton
                      groupId={shop.groupId}
                      on={repeatingSeries.every((id) => reminders.bySeries[id])}
                      everyForPage={remindEveryTimeForPageAction}
                    />
                  ) : null
                }
              />
            </div>
          ))}
      </header>

      {/* Page kinds (dispatch, 2026-10-05): a group leads with its next meetup (Meetup). */}
      {layout.lead === 'join' && loggedIn && <NextUp posts={posts} heading="Next event" limit={1} />}

      {(shop.publicDescription || shop.unclaimed?.publicInfoUrl || shop.founder) && (
        <PageSection id="about" title="About">
          {shop.publicDescription && <AboutText text={shop.publicDescription} />}
          {shop.unclaimed?.publicInfoUrl && isSafeLinkUrl(shop.unclaimed.publicInfoUrl) && (
            <a data-testid="description-credit" href={shop.unclaimed.publicInfoUrl.trim()} rel="noopener noreferrer nofollow" target="_blank" className="self-start text-caption text-[var(--color-fg-muted)] underline">
              {COPY.unclaimedDescriptionCredit}
            </a>
          )}
          {shop.founder && (
            // #303 — no public member profile (Don, 2026-10-01): the founder is a name, never a link.
            <div data-testid="shop-founder" className="flex items-center gap-2">
              <span data-testid="shop-founder-text" className="flex items-center gap-2">
                {shop.founder.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shop.founder.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                )}
                <span className="text-body-sm text-[var(--color-fg-muted)]">Started by {shop.founder.displayName}</span>
              </span>
            </div>
          )}
        </PageSection>
      )}

      {/* F093 criterion 8 — signed out sees no location and no map pin. */}
      {loggedIn && (mapView || areaLine || how || stops.length > 0) && (
        <PageSection id="location" title="Location">
          {/* T143 — where this Page resolves to, at read time; #896 — the address under the map. */}
          {mapView && <PageMap view={mapView} caption={mapView.text} publicId={shop.publicId} />}
          {/* #896 — no map: a plain line with a small location icon says where (no chips). */}
          {areaLine && (
            <p data-testid="shop-placement" className="flex items-start gap-2 text-body-sm text-[var(--color-fg)]">
              <MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {areaLine}
            </p>
          )}
          {how && (
            <p data-testid="shop-where" className={mapView || areaLine ? 'text-body-sm text-[var(--color-fg-muted)]' : 'flex items-start gap-2 text-body-sm text-[var(--color-fg)]'}>
              {!mapView && !areaLine && <MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0" />}
              {how}
            </p>
          )}
          {/* #896 — more than one location, or where and when it moves. */}
          {stops.length > 0 && <PageStops stops={stops} schedule={where?.mode === 'roaming'} name={shop.displayName} />}
        </PageSection>
      )}

      {hasContact && (
        <PageSection id="contact" title="Contact">
          <PageContactBlock contact={contact ?? null} links={contactLinks} />
        </PageSection>
      )}

      {showFound && (
        <PageSection id="found" title="Tags">
          {/* #316 — the Page's tags as #hashtags, signed in only (F093); moderated after they appear (#287). */}
          {tags.length > 0 && <TagChips tags={tags} />}
        </PageSection>
      )}

      {/* F093 — one list or the other, never both: two would mean two
          elements carrying the same `announcement-<id>`. */}
      {withheldPosts.length > 0 ? (
        <WithheldPagePosts posts={withheldPosts} />
      ) : (
        <PagePosts
          groupId={shop.groupId}
          posts={posts}
          canPost={viewerOwnsPage}
          followerCount={followerCount}
          isPrivate={shop.discoverability === 'private'}
          memberId={viewerOwnsPage ? viewerMemberId : null}
          pageName={shop.displayName}
          pictureUrl={shop.pictureUrl ?? null}
          artKind={artKindFor(shop.kind, shop.purpose)}
          report={{ loggedIn, returnTo: pagePath, onSend: sendReportAction }}
          onPost={postToPageAction}
          onEdit={editPagePostAction}
          onDelete={deletePagePostAction}
          onReport={sendPostReportAction}
          loggedIn={loggedIn}
          returnTo={pagePath}
          reminders={viewerOwnsPage ? undefined : { viewer: reminders, set: setReminderAction, remove: removeReminderAction }}
        />
      )}

      {showProducts && (
        <PageSection id="products" title="Products & services">
          <FeaturedItems
            groupId={shop.groupId}
            items={items}
            canEdit={viewerOwnsPage}
            memberId={viewerOwnsPage ? viewerMemberId : null}
            onSave={saveFeaturedItemAction}
            onRemove={removeFeaturedItemAction}
            report={viewerOwnsPage ? undefined : { loggedIn, returnTo: pagePath, onSend: sendReportAction }}
          />
        </PageSection>
      )}

      {/* F037 — owner-only Locally Owned claim management; non-owners and anon never see it. */}
      {/* [open-question owner=cowork raised=2026-10-06] Badges are cut from beta, Locally owned included (DECISIONS 2026-10-06), but F037's eval still requires this claim card; retire F037 for beta or keep the card? */}
      {ownerClaim && isBusinessKind(shop.kind) && (
        <LocallyOwnedClaim groupId={shop.groupId} onSet={setJurisdictionAction} onRemove={removeJurisdictionAction} />
      )}

      {/* #909 — owner-only: what locals near the Page searched this month. */}
      {viewerOwnsPage && !isDraftPreview && <SearchDemandCard demand={searchDemand} />}

      {shop.unclaimed && (
        <UnclaimedBox
          groupId={shop.groupId}
          pagePath={pagePath ?? `/g/${shop.publicId}`}
          hasPhoto={Boolean(photoUrl)}
          onClaim={unclaimedActions?.claim ?? requestUnclaimedClaimAction}
          onRemove={unclaimedActions?.remove ?? requestUnclaimedRemovalAction}
        />
      )}
     </div>
      {showOwnerPanel && pagePath && !isDraftPreview ? (
        <aside data-testid="owner-panel" className="hidden lg:block">
          <div className="sticky top-[calc(var(--nav-top-h)+--spacing(4))]">
            <OwnerPanel pagePath={pagePath} />
          </div>
        </aside>
      ) : null}
    </main>
    </LocalOwnerClaimProvider>
  )
  // #412 — the owner edits on the Edit Page; only a draft's checklist opens
  // a section's sheet here, in place.
  if (!viewerOwnsPage || !pagePath || !isDraftPreview) return page
  return (
    <PageEditorProvider
      onSave={editPageAction}
      initial={{
        groupId: shop.groupId,
        pagePath,
        memberId: viewerMemberId ?? '',
        name: shop.displayName === DRAFT_NAME_PLACEHOLDER ? '' : shop.displayName,
        description: shop.publicDescription,
        photoUrl: shop.photoUrl,
        socialLinks: shop.socialLinks,
        tags,
        contact: contact ?? { phone: null, hours: null },
        contactOn,
        addressLabel: whereNow(where, shop.placements[0]),
        kind: pageKindOf(shop.kind),
        purpose: purposeOf(shop.kind, shop.purpose),
        productsOn,
        where: whereValueFrom(where ?? null, placement),
        savedPin: savedPinFrom(placement),
      }}
    >
      {page}
    </PageEditorProvider>
  )
}
