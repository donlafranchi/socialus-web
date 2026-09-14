// T074 — Public Shop page presentational component (F035 read surface).
// Spec: planning/now/scenario-F035-rosa-finds-mayas-shop.md story beats 1–6.
//
// Presentational + server-renderable. Data fetching lives in the route
// (src/app/p/[...slug]/page.tsx); this component renders the resolved shape so
// it stays unit-testable. The only client island is <FollowShopButton>.

import type { ResolvedShop, ShopItem, LocalOwnerBadge, OwnerClaim } from '@/lib/groups/resolve-shop'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { FollowShopButton } from './FollowShopButton'
import { ReportControl } from './ReportControl'
import { HiddenPhotoNotice } from './HiddenPhotoNotice'
import { sendReportAction } from '@/app/_actions/report-actions'
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
}

export function ShopPublicPage({
  shop,
  badge,
  items,
  loggedIn,
  ownerClaim = null,
  viewerOwnsPage = false,
  pagePath,
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

          {/* T160 — every viewer gets this, signed in or not. A signed-out
              member is sent to sign-in, never to a dead end. */}
          <div className="ml-auto">
            <ReportControl
              subjectId={shop.groupId}
              subjectLabel={shop.displayName}
              loggedIn={loggedIn}
              returnTo={pagePath}
              onSend={sendReportAction}
            />
          </div>
        </div>

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

        <div className="mt-2">
          <FollowShopButton loggedIn={loggedIn} shopName={shop.displayName} />
        </div>
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
