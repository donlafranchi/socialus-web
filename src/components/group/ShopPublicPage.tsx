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
import { whereLine, type PageWhere } from '@/lib/groups/page-where'
import type { PageContact } from '@/lib/groups/page-contact'
import type { ResolvedShop, ShopItem, LocalOwnerBadge, OwnerClaim } from '@/lib/groups/resolve-shop'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { FollowPageButton } from './FollowPageButton'
import { ReportControl } from './ReportControl'
import { OwnerBar } from './OwnerBar'
import { HiddenPhotoNotice } from './HiddenPhotoNotice'
import { socialLinksForDisplay } from '@/lib/groups/social-links'
import { sendReportAction, sendPostReportAction } from '@/app/_actions/report-actions'
import { followPageAction, unfollowPageAction } from '@/app/_actions/page-follow-actions'
import { PagePosts } from './PagePosts'
import { WithheldPagePosts } from './WithheldPagePosts'
import { postToPageAction, editPagePostAction, deletePagePostAction } from '@/app/_actions/page-post-actions'
import type { PagePost } from '@/lib/groups/page-posts'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import { SharePageButton } from './SharePageButton'
import { NextUp } from './NextUp'
import { Store, Users } from 'lucide-react'
import { kindLine, pageKindOf, pageLayoutFor, purposeOf, type Purpose } from '@/lib/groups/page-kind'
import { componentOn, isBusinessKind } from '@/lib/groups/page-components'
import { UnclaimedBox } from './UnclaimedBox'
import { requestUnclaimedClaimAction, requestUnclaimedRemovalAction } from '@/app/_actions/unclaimed-actions'
import { COPY } from '@/lib/copy'
import { LocallyOwnedClaim } from './LocallyOwnedClaim'
import { setJurisdictionAction, removeJurisdictionAction } from '@/app/p/[...slug]/claim-actions'
import { SHOW_OPENING_HOURS } from '@/lib/features'
import { PageSection } from './PageSection'
import { AboutText } from './AboutText'
import { PageMap } from './PageMap'

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
  draftTagCount = 0,
  unclaimedActions,
  viewerMemberId = null,
  contactOn = false,
  productsOn = componentOn(shop.kind, null, 'products'),
}: Props) {
  const isDraftPreview = shop.lifecycleState === 'draft'
  const layout = pageLayoutFor(shop.kind)

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
  const showOwnerPanel = viewerOwnsPage && Boolean(pagePath)
  // F093 criterion 8 — signed out is the front door: name, photo, description,
  // the withheld card and Sign up to follow. Listings and links out wait.
  const socialLinks = loggedIn ? socialLinksForDisplay(shop.socialLinks) : []

  const placement = shop.placements[0]
  const placeLabel = placement?.label.trim() || null
  const how = loggedIn && where ? whereLine(where) : null
  const hasContact = loggedIn && contact && (contact.phone || (SHOW_OPENING_HOURS && contact.hours))
  const showFound = loggedIn && (tags.length > 0 || socialLinks.length > 0)
  // bug #338 — a member's row is membership, not a follow, so nothing offers to undo it.
  const memberOfOpenPage = viewerIsMember && shop.discoverability !== 'private'
  // #363 — off for a social group until its owner adds it (bug #341).
  const showProducts = loggedIn && productsOn
  const draftHeading = DRAFT_HEADING[purposeOf(shop.kind, shop.purpose)]

  const page = (
    // #300 — T2 Detail: a centred read-width column; from 1024 the owner's
    // panel sits beside it (720 + 48 + 360 inside the 1128 detail width).
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
              {badge && isBusinessKind(shop.kind) && (
                <span data-testid="local-owner-badge" className="chip chip-selected whitespace-nowrap text-xs">
                  {badge.label}
                </span>
              )}
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
              <ReportControl subjectId={shop.groupId} subjectLabel={shop.displayName} loggedIn={loggedIn} returnTo={pagePath} onSend={sendReportAction} />
            )}
          </div>
        </div>

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
              />
            </div>
          ))}
      </header>

      {/* Page kinds (dispatch, 2026-10-05): a group leads with its next meetup (Meetup). */}
      {layout.lead === 'join' && loggedIn && <NextUp posts={posts} heading="Next event" limit={1} />}

      {(shop.publicDescription || shop.unclaimed?.publicInfoUrl || shop.founder) && (
        <PageSection id="about" title="About">
          {shop.publicDescription && <AboutText text={shop.publicDescription} />}
          {shop.unclaimed?.publicInfoUrl && (
            <a data-testid="description-credit" href={shop.unclaimed.publicInfoUrl} rel="noopener nofollow" target="_blank" className="self-start text-caption text-[var(--color-fg-muted)] underline">
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
      {loggedIn && (placeLabel || how) && (
        <PageSection id="location" title="Location">
          {/* T143 — where this Page resolves to, at read time. */}
          {placeLabel && (
            <p data-testid="shop-placement" className="text-body-sm text-[var(--color-fg)]">
              {placeLabel}
            </p>
          )}
          {how && (
            <p data-testid="shop-where" className="text-body-sm text-[var(--color-fg-muted)]">
              {how}
            </p>
          )}
          {placement && placeLabel && <PageMap lng={placement.lng} lat={placement.lat} label={placeLabel} area={placement.kind === 'area'} />}
        </PageSection>
      )}

      {hasContact && contact && (
        <PageSection id="contact" title="Contact">
          <PageContactBlock contact={contact} />
        </PageSection>
      )}

      {showFound && (
        <PageSection id="found" title="Tags & links">
          {/* #316 — the Page's tags as #hashtags, signed in only (F093); moderated after they appear (#287). */}
          {tags.length > 0 && <TagChips tags={tags} />}
          {/* F070 — `socialLinksForDisplay` re-checks every URL on read; off-platform, in a new tab. */}
          {socialLinks.length > 0 && (
            <ul className="flex flex-wrap gap-3" data-testid="shop-social-links">
              {socialLinks.map((link) => (
                <li key={link.platform}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`shop-social-${link.platform}`}
                    className="press inline-flex min-h-tap items-center text-body-sm text-[var(--color-accent)] underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
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
          onPost={postToPageAction}
          onEdit={editPagePostAction}
          onDelete={deletePagePostAction}
          onReport={sendPostReportAction}
          loggedIn={loggedIn}
          returnTo={pagePath}
        />
      )}

      {showProducts && (
        <PageSection id="products" title="Products & services">
          {/* F035 beat 3 — visible but empty: the Page is real, and listings will come. */}
          {items.length === 0 ? (
            <div data-testid="shop-items-empty" className="text-body-sm text-[var(--color-fg-muted)]">
              <p className="font-medium text-[var(--color-fg)]">Nothing listed yet</p>
              <p className="mt-1">This Page hasn&apos;t listed anything yet. Check back soon.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.id} className="card p-3 text-sm">
                  {item.title}
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      )}

      {/* F037 — owner-only Locally Owned claim management; non-owners and anon never see it. */}
      {/* [open-question owner=cowork raised=2026-10-06] Badges are cut from beta, Locally owned included (DECISIONS 2026-10-06), but F037's eval still requires this claim card; retire F037 for beta or keep the card? */}
      {ownerClaim && isBusinessKind(shop.kind) && (
        <LocallyOwnedClaim groupId={shop.groupId} claim={ownerClaim} onSet={setJurisdictionAction} onRemove={removeJurisdictionAction} />
      )}

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
        addressLabel: shop.placements[0]?.label || null,
        kind: pageKindOf(shop.kind),
        purpose: purposeOf(shop.kind, shop.purpose),
        productsOn,
        where: whereValueFrom(where ?? null, shop.placements[0]),
        savedPin: savedPinFrom(shop.placements[0]),
      }}
    >
      {page}
    </PageEditorProvider>
  )
}
