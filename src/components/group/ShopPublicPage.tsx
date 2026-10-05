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
import { PageEditorProvider, SectionEditButton } from './edit/PageEditor'
import { editPageAction } from '@/app/g/[handle]/edit/actions'
import { DefaultArt, artKindFor } from '@/components/cards/DefaultArt'
import { TagChips } from '@/components/tags/TagChips'
import { PageContactBlock } from './PageContactBlock'
import type { PageContact } from '@/lib/groups/page-contact'
import type { ResolvedShop, ShopItem, LocalOwnerBadge, OwnerClaim } from '@/lib/groups/resolve-shop'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { FollowPageButton } from './FollowPageButton'
import { ReportControl } from './ReportControl'
import { OwnerBar } from './OwnerBar'
import { HiddenPhotoNotice } from './HiddenPhotoNotice'
import { socialLinksForDisplay } from '@/lib/groups/social-links'
import { sendReportAction } from '@/app/_actions/report-actions'
import { followPageAction, unfollowPageAction } from '@/app/_actions/page-follow-actions'
import { PagePosts } from './PagePosts'
import { WithheldPagePosts } from './WithheldPagePosts'
import { postToPageAction, editPagePostAction, deletePagePostAction } from '@/app/_actions/page-post-actions'
import type { PagePost } from '@/lib/groups/page-posts'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import { LocallyOwnedClaim } from './LocallyOwnedClaim'
import { NextUp } from './NextUp'
import { PAGE_KIND_LABEL, pageKindOf, pageLayoutFor } from '@/lib/groups/page-kind'
import { isBusinessKind } from '@/lib/groups/page-components'
import { setJurisdictionAction, removeJurisdictionAction } from '@/app/p/[...slug]/claim-actions'

interface Props {
  shop: ResolvedShop
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
  /** #316 — the Page's tags; empty signed out. */
  tags?: string[]
  /** #293 — phone and hours. The front door shows neither (F093 criterion 8). */
  contact?: PageContact | null
}

// Don, 2026-10-04: an unnamed draft is called what Create asked about.
const DRAFT_HEADING: Record<string, string> = { business: 'business', interest: 'group or meetup', event_anchored: 'organization' }

export function ShopPublicPage({
  shop,
  badge,
  items,
  loggedIn,
  ownerClaim = null,
  viewerOwnsPage = false,
  pagePath,
  viewerFollows = false,
  posts = [],
  tags = [],
  contact = null,
  withheldPosts = [],
  followerCount = 0,
  draftTagCount = 0,
  viewerMemberId = null,
  contactOn = false,
}: Props) {
  const isDraftPreview = shop.lifecycleState === 'draft'
  const layout = pageLayoutFor(shop.kind)

  // T160 — the hide, as every surface must read it. `visiblePhotoUrl()` is the
  // single place `photo_hidden_at` is consulted; nothing here reads
  // `shop.photoUrl` directly, which is what keeps a hide a hide.
  const photoUrl = visiblePhotoUrl({
    photo_url: shop.photoUrl,
    photo_hidden_at: shop.photoHiddenAt,
  })
  // Only the owner is told. Everyone else sees what a photoless Page shows —
  // today nothing, and T146's default art once that lands. Neither reveals
  // that a photo exists, or that anyone reported it.
  const showHiddenNotice = viewerOwnsPage && photoUrl === null && shop.photoHiddenAt !== null
  const showOwnerPanel = viewerOwnsPage && Boolean(pagePath)
  // F093 criterion 8 — signed out is the front door: name, photo, description,
  // the withheld card and Sign up to follow. Listings and links out wait.
  const socialLinks = loggedIn ? socialLinksForDisplay(shop.socialLinks) : []

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
     <div className="min-w-0">
      {/* #301 — a draft is finished here, on the Page, not in a walkthrough. */}
      {isDraftPreview && (
        <div data-testid="shop-draft-banner" role="status" className="mb-4 text-caption font-medium text-[var(--color-fg-muted)]">
          Draft · only you can see this
        </div>
      )}

      {showHiddenNotice && (
        <div className="mb-6">
          <HiddenPhotoNotice />
        </div>
      )}

      {/* #300 — the cover: the photo, or the default art when there is none or
          it is hidden. Decorative: the name is right under it. */}
      <div data-testid="page-cover" className="mb-4 aspect-[2/1] overflow-hidden rounded-lg md:aspect-[3/1]">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <DefaultArt kind={artKindFor(shop.kind)} />
        )}
      </div>
      <SectionEditButton section="photo" className="-mt-2 mb-2" />

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 data-testid="shop-name" className="text-title-1 md:text-title-1-lg">
            {isDraftPreview && shop.displayName === DRAFT_NAME_PLACEHOLDER
              ? `Your new ${DRAFT_HEADING[shop.kind] ? `${DRAFT_HEADING[shop.kind]} ` : ''}Page`
              : shop.displayName}
          </h1>
          <SectionEditButton section="about" />
          {badge && isBusinessKind(shop.kind) && (
            <span
              data-testid="local-owner-badge"
              className="chip chip-selected whitespace-nowrap text-xs"
            >
              {badge.label}
            </span>
          )}

          {/* T160 — every viewer but the owner gets this, signed in or not. A
              signed-out member is sent to sign-in, never to a dead end. */}

        {/* #267 — not on your own Page. */}
          {!viewerOwnsPage && (
            <div className="ml-auto">
              <ReportControl
                subjectId={shop.groupId}
                subjectLabel={shop.displayName}
                loggedIn={loggedIn}
                returnTo={pagePath}
                onSend={sendReportAction}
              />
            </div>
          )}
        </div>
        <div className="-mt-2 flex items-center gap-2">
          <p data-testid="page-kind" className="text-body-sm text-[var(--color-fg-muted)]">{PAGE_KIND_LABEL[pageKindOf(shop.kind)]}</p>
          <SectionEditButton section="kind" />
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

        {shop.founder && (
          <div data-testid="shop-founder" className="flex items-center gap-2">
            {/* T137 — link only when the founder has published something;
                otherwise render the name as plain text. The Shop is public regardless
                (Groups are public-by-default); only the personal-profile link is gated. */}
            {shop.founder.hasPublished ? (
              <a
                href={`/m/${shop.founder.handle}`}
                data-testid="shop-founder-link"
                className="flex items-center gap-2"
              >
                {shop.founder.avatarUrl && (
                  // Decorative: the adjacent name text labels the link.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shop.founder.avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                )}
                <span className="text-sm text-gray-700">{shop.founder.displayName}</span>
              </a>
            ) : (
              <span
                data-testid="shop-founder-text"
                className="flex items-center gap-2"
              >
                {shop.founder.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shop.founder.avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                )}
                <span className="text-sm text-gray-700">{shop.founder.displayName}</span>
              </span>
            )}
          </div>
        )}

        {/* T143 — where this Page currently resolves to, shown to every
            viewer including the owner. Resolved at read time (see
            resolvePagePlacements); nothing here is stored on the Page. */}
        {shop.placements[0] && (
          <p data-testid="shop-placement" className="text-sm text-gray-600">
            {shop.placements[0].label}
          </p>
        )}
        <SectionEditButton section="where" className="self-start" />

        {/* Page kinds (dispatch, 2026-10-05): each kind leads with its own
            thing. A business: how to reach it, then Follow. A group: Join and
            its next meetup. An organization: its upcoming events. */}
        {layout.lead === 'contact' && (
          <>
            {loggedIn && contact && <PageContactBlock contact={contact} />}
            {contactOn && <SectionEditButton section="contact" className="self-start" />}
          </>
        )}
        {/* #267 — not on your own Page: your row there is your authority, not
            a follow, and "Following" would have offered to end it. */}
        {!viewerOwnsPage && (
          <div className="mt-2">
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
        )}
        {layout.lead !== 'contact' && loggedIn && (
          <NextUp posts={posts} heading={layout.lead === 'join' ? 'Next meetup' : 'Upcoming events'} limit={layout.lead === 'join' ? 1 : 3} />
        )}

        {shop.publicDescription && (
          <p className="text-sm text-gray-600">{shop.publicDescription}</p>
        )}


        {layout.lead !== 'contact' && (
          <>
            {loggedIn && contact && <PageContactBlock contact={contact} />}
            {contactOn && <SectionEditButton section="contact" className="self-start" />}
          </>
        )}

        {/* #316 — the Page's tags as #hashtags, signed in only (F093). Tags are
            moderated after they appear (#287). */}
        {loggedIn && tags.length > 0 && <TagChips tags={tags} />}
        <SectionEditButton section="tags" className="self-start" />

        {/* F070 — the Page's links out. `socialLinksForDisplay` re-checks every
            URL on read: this renders straight into href, and a row written
            before the column had its CHECK must not reach one unchecked.
            rel="noopener noreferrer" because these point off-platform, and
            target="_blank" so a member does not lose the Page to follow one. */}
        {socialLinks.length > 0 && (
          <ul className="flex flex-wrap gap-3 mt-2" data-testid="shop-social-links">
            {socialLinks.map((link) => (
              <li key={link.platform}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`shop-social-${link.platform}`}
                  className="text-sm underline text-[var(--color-accent)]"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
        <SectionEditButton section="links" className="self-start" />
        <SectionEditButton section="components" className="self-start" />

      </header>

      {/* F037 — owner-only Locally Owned claim management. Rendered only when the
          viewer is an active owner (ownerClaim resolved non-null); non-owners and
          anon never see it. */}
      {ownerClaim && isBusinessKind(shop.kind) && (
        <LocallyOwnedClaim
          groupId={shop.groupId}
          claim={ownerClaim}
          onSet={setJurisdictionAction}
          onRemove={removeJurisdictionAction}
        />
      )}

      {/* F072 — what the Page has said, above what it lists. Acceptance 2
          puts a post at the top of its Page; the owner's composer lives here
          too, so saying something and seeing it are the same place. */}
      {/* F093 — one list or the other, never both. Two of them would mean two
          Announcements headings and two elements carrying the same
          `announcement-<id>`, and a fragment would land on whichever rendered
          first. Which one is decided by whether a withheld read happened at
          all, which `loadPageView` only does when there is no member. */}
      {withheldPosts.length > 0 ? (
        <WithheldPagePosts posts={withheldPosts} />
      ) : (
        <PagePosts
          groupId={shop.groupId}
          posts={posts}
          canPost={viewerOwnsPage}
          followerCount={followerCount}
          onPost={postToPageAction}
          onEdit={editPagePostAction}
          onDelete={deletePagePostAction}
        />
      )}

      {loggedIn && layout.productsAndServices && (
      <section className="mt-8">
        <h2 className="text-lg font-medium">Products &amp; services</h2>
        {items.length === 0 ? (
          <div
            data-testid="shop-items-empty"
            className="mt-3 rounded border border-dashed border-gray-300 p-6 text-sm text-gray-500"
          >
            <p className="font-medium text-gray-600">Nothing listed yet</p>
            <p className="mt-1">This Page hasn&apos;t listed anything yet — check back soon.</p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="card p-3 text-sm">
                {item.title}
              </li>
            ))}
          </ul>
        )}
      </section>
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
  if (!viewerOwnsPage || !pagePath) return page
  return (
    <PageEditorProvider
      onSave={editPageAction}
      initial={{
        groupId: shop.groupId,
        pagePath,
        memberId: viewerMemberId ?? '',
        name: shop.displayName,
        description: shop.publicDescription,
        photoUrl: shop.photoUrl,
        socialLinks: shop.socialLinks,
        tags,
        contact: contact ?? { phone: null, hours: null },
        contactOn,
        addressLabel: shop.placements[0]?.label ?? null,
        kind: pageKindOf(shop.kind),
      }}
    >
      {page}
    </PageEditorProvider>
  )
}
