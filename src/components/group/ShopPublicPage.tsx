// T074 — Public Shop page presentational component (F035 read surface).
// Spec: planning/now/scenario-F035-rosa-finds-mayas-shop.md story beats 1–6.
//
// Presentational + server-renderable. Data fetching lives in the route
// (src/app/p/[...slug]/page.tsx); this component renders the resolved shape so
// it stays unit-testable. The client islands are <FollowPageButton> and
// <ReportControl>.

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
import { postToPageAction, editPagePostAction } from '@/app/_actions/page-post-actions'
import type { PagePost } from '@/lib/groups/page-posts'
import type { BrowseResult } from '@/lib/feed/browse-feed'
import { LocallyOwnedClaim } from './LocallyOwnedClaim'
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
  /** #293 — phone and hours. The front door shows neither (F093 criterion 8). */
  contact?: PageContact | null
}

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
  contact = null,
  withheldPosts = [],
  followerCount = 0,
}: Props) {
  const isDraftPreview = shop.lifecycleState === 'draft'

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      {isDraftPreview && (
        <div
          data-testid="shop-draft-banner"
          role="status"
          className="mb-6 rounded border border-dashed border-gray-400 bg-gray-50 p-4 text-sm text-gray-700"
        >
          <p className="font-medium">Draft — not yet public.</p>
          <p className="mt-1">
            Only you can see this. <a href="/you/sell" className="underline">Resume walkthrough</a> to
            finish setting up your Shop.
          </p>
        </div>
      )}

      {showHiddenNotice && (
        <div className="mb-6">
          <HiddenPhotoNotice />
        </div>
      )}

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 data-testid="shop-name" className="text-2xl font-semibold">
            {shop.displayName}
          </h1>
          {badge && (
            <span
              data-testid="local-owner-badge"
              className="chip chip-selected whitespace-nowrap text-xs"
            >
              {badge.label}
            </span>
          )}

          {/* T160 — every viewer but the owner gets this, signed in or not. A
              signed-out member is sent to sign-in, never to a dead end. */}
          {loggedIn && contact && <PageContactBlock contact={contact} />}

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

        {/* Owner only, and absent from the markup for everyone else — this
            component is not rendered at all unless the server resolved
            ownership. The writes behind it re-check the managing role. */}
        {viewerOwnsPage && pagePath ? <OwnerBar pagePath={pagePath} /> : null}

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

        {/* T159 — no category is shown. Categories are retired (tags are the
            only vocabulary), and tags are NOT displayed here yet: a public
            tag is member-contributed content other members see, which rule 1
            bars from production until report-and-takedown exists (#13). */}

        {/* T143 — where this Page currently resolves to, shown to every
            viewer including the owner. Resolved at read time (see
            resolvePagePlacements); nothing here is stored on the Page. */}
        {shop.placements[0] && (
          <p data-testid="shop-placement" className="text-sm text-gray-600">
            {shop.placements[0].label}
          </p>
        )}

        {shop.publicDescription && (
          <p className="text-sm text-gray-600">{shop.publicDescription}</p>
        )}

        {/* F070 — the Page's links out. `socialLinksForDisplay` re-checks every
            URL on read: this renders straight into href, and a row written
            before the column had its CHECK must not reach one unchecked.
            rel="noopener noreferrer" because these point off-platform, and
            target="_blank" so a member does not lose the Page to follow one. */}
        {socialLinksForDisplay(shop.socialLinks).length > 0 && (
          <ul className="flex flex-wrap gap-3 mt-2" data-testid="shop-social-links">
            {socialLinksForDisplay(shop.socialLinks).map((link) => (
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

        {/* #267 — not on your own Page: your row there is your authority, not
            a follow, and "Following" would have offered to end it. */}
        {!viewerOwnsPage && (
          <div className="mt-2">
            <FollowPageButton
              groupId={shop.groupId}
              isPrivate={shop.discoverability === 'private'}
              loggedIn={loggedIn}
              following={viewerFollows}
              returnTo={pagePath}
              onFollow={followPageAction}
              onUnfollow={unfollowPageAction}
            />
          </div>
        )}
      </header>

      {/* F037 — owner-only Locally Owned claim management. Rendered only when the
          viewer is an active owner (ownerClaim resolved non-null); non-owners and
          anon never see it. */}
      {ownerClaim && (
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
        />
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Products &amp; services</h2>
        {items.length === 0 ? (
          <div
            data-testid="shop-items-empty"
            className="mt-3 rounded border border-dashed border-gray-300 p-6 text-sm text-gray-500"
          >
            <p className="font-medium text-gray-600">Nothing listed yet</p>
            <p className="mt-1">
              {shop.founder?.displayName ?? 'This Shop'} hasn&apos;t listed anything yet — check
              back soon.
            </p>
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
    </main>
  )
}
