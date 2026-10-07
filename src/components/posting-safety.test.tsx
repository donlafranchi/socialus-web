// F080 criterion 5 — wherever a member posts, the app asks them, for safety
// reasons, to post nothing sensitive. The words are Don's, in src/lib/copy.ts.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { COPY } from '@/lib/copy'

vi.mock('@/lib/geocoding', () => ({
  geocode: vi.fn(),
  GeocodingUnavailableError: class GeocodingUnavailableError extends Error {},
}))
vi.mock('@/app/_actions/location-actions', () => ({
  searchPlacesAction: vi.fn(async () => ({ ok: true, data: [] })),
  listNeighborhoodsAction: vi.fn(async () => []),
  createLocationAction: vi.fn(),
  metroAnchorPlaceAction: vi.fn(),
  placeForPointAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

// The composers publish on the shared composer's final step; what each one
// hands it as that step's notice is what a member reads as they post.
vi.mock('@/components/composer/MultiStepComposer', () => ({
  MultiStepComposer: ({ finalNotice }: { finalNotice?: ReactNode }) => (
    <div data-testid="final-notice">{finalNotice}</div>
  ),
}))

import { SellWalkthrough } from './sell/SellWalkthrough'
import { ProductComposer } from './sell/ProductComposer'
import { ServiceComposer } from './sell/ServiceComposer'
import { GatheringComposer } from './sell/GatheringComposer'
import { PagePosts } from './group/PagePosts'
import { EditCards } from './group/edit/EditCards'
import { emptyWhere } from './locations/WhereFields'

afterEach(() => cleanup())

const noop = vi.fn()
const asyncNoop = vi.fn(async () => ({}) as never)
const message = () => screen.getByText(COPY.postingSafety)

// #412 — a live Page is edited section by section; its words and photo are
// posted from the sheets the Edit Page's cards open.
const editCards = () => (
  <EditCards title="Edit P" isDraft={false} onSave={asyncNoop} initial={{
    groupId: 'g1', pagePath: '/g/p', memberId: 'm1', name: 'P', description: '', photoUrl: null, socialLinks: {}, tags: [],
    contact: { phone: null, hours: null }, contactOn: false, addressLabel: null, kind: 'business', purpose: 'sell', productsOn: true, where: emptyWhere,
  }} />
)

describe('F080 — the safety message where a member posts', () => {
  const postProps = { groupId: 'g1', posts: [], followerCount: 0, onPost: asyncNoop, onEdit: asyncNoop,
    onCreateLocation: asyncNoop }

  it("is Don's short placeholder at posting, word for word", () => {
    expect(COPY.postingSafety).toBe(
      "Please don't post anything sensitive, like content involving children, pets, or anyone who can't speak up for themselves. We rely on each other to keep this place kind and decent.",
    )
  })

  it("keeps Don's full placeholder as its own key, for the rules page (#223)", () => {
    expect(COPY.postingSafetyFull).toBe(
      "While we grow into a platform with a full team, we're asking for your help. Please don't post anything sensitive: content involving children, pets, or anyone who can't speak up for themselves, or anything unpleasant we'd have to ask a person on our team to look at. We look out for you, and we ask you to look out for us and each other. We rely on each other to keep this place kind and decent. Let's make it an example of the future we want to build together.",
    )
  })

  it('shows the short line at posting, never the full one', () => {
    render(<PagePosts {...postProps} canPost startComposing />)
    expect(screen.queryByText(COPY.postingSafetyFull)).toBeNull()
  })

  // Every surface a member can post from: a new Page (with its photo), an
  // edit to a live Page (photo, words), an announcement, and each item kind.
  // [guards F080.5]
  it.each([
    ['publishing a new Page', () => (
      <SellWalkthrough memberId="m1" createDraft={asyncNoop} updateDraft={asyncNoop} activate={asyncNoop}
        createLocation={asyncNoop} availableLocations={[]} redirect={noop} showToast={noop} onAbandon={noop} />
    )],
    ['saving a live Page, its words and photo (Basics, #452)', editCards, 'Edit Basics'],
    ['announcing', () => <PagePosts {...postProps} canPost startComposing />],
    ['publishing a product', () => (
      <ProductComposer createProduct={asyncNoop} createLocation={asyncNoop} availableLocations={[]}
        redirect={noop} showToast={noop} onAbandon={noop} />
    )],
    ['publishing a service', () => (
      <ServiceComposer createService={asyncNoop} createLocation={asyncNoop} availableLocations={[]}
        redirect={noop} showToast={noop} onAbandon={noop} />
    )],
    ['publishing a gathering', () => (
      <GatheringComposer createGathering={asyncNoop} redirect={noop} showToast={noop} onAbandon={noop} />
    )],
  ] as [string, () => ReactNode, string?][])('shows when %s', (_what, ui, open) => {
    render(ui())
    if (open) fireEvent.click(screen.getByRole('button', { name: open }))
    expect(message()).toBeInTheDocument()
  })

  it('shows on the composer step that publishes', () => {
    render(<ProductComposer createProduct={asyncNoop} createLocation={asyncNoop} availableLocations={[]}
      redirect={noop} showToast={noop} onAbandon={noop} />)
    expect(screen.getByTestId('final-notice')).toContainElement(message())
  })

  it('does not show to someone who cannot announce', () => {
    render(<PagePosts {...postProps} canPost={false} />)
    expect(screen.queryByText(COPY.postingSafety)).toBeNull()
  })
})
