// F080 criterion 5 — wherever a member posts, the app asks them, for safety
// reasons, to post nothing sensitive. The words are Don's, in src/lib/copy.ts.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
import { EditPageForm } from '@/app/g/[handle]/edit/EditPageForm'

afterEach(() => cleanup())

const noop = vi.fn()
const asyncNoop = vi.fn(async () => ({}) as never)
const message = () => screen.getByText(COPY.postingSafety)

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
    render(<PagePosts {...postProps} canPost />)
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
    ['saving a live Page', () => (
      <EditPageForm groupId="g1" memberId="m1" pagePath="/g/p" slug="p" initialName="P" initialDescription=""
        initialPhotoUrl={null} initialSocialLinks={{}} initialAddressLabel={null}
        onSave={asyncNoop} onCreateLocation={asyncNoop} />
    )],
    ['announcing', () => <PagePosts {...postProps} canPost />],
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
  ])('shows when %s', (_what, ui) => {
    render(ui())
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
