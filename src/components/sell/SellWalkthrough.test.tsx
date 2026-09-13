// T073 — Unit tests for <SellWalkthrough>.
// Trace: each test maps to a Then-clause from F036's scenario or to an
// acceptance-criteria checkbox in T073.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// T142 — the "+ Add a new Location" drawer now embeds <LocationPlaceFields>,
// which calls the real geocoder and the neighbourhoods action. Mocked here
// so this stays a unit test of SellWalkthrough, not an integration test of
// the geocoder or the DB.
const { geocode } = vi.hoisted(() => ({ geocode: vi.fn() }))
vi.mock('@/lib/geocoding', () => ({ geocode }))
vi.mock('@/app/you/sell/actions', () => ({
  sellListNeighborhoodsAction: vi.fn(async () => []),
}))

import { SellWalkthrough, type AnchorLocationOption } from './SellWalkthrough'

function setup(overrides: Partial<Parameters<typeof SellWalkthrough>[0]> = {}) {
  const createDraft = vi.fn(async ({ brand }: { brand: string }) => {
    void brand
    return { groupId: 'g-draft-1' }
  })
  const updateDraft = vi.fn(async (_input: Record<string, unknown>) => {
    void _input
  })
  const activate = vi.fn(
    async (_input: { groupId: string; tags: string[] }) => {
      void _input
      return { destinationUrl: '/p/sacramento/g/oak-park-sourdough-abc1' }
    },
  )
  const createLocation = vi.fn(async (input: { label: string }) => ({
    id: 'loc-new',
    label: input.label,
  }))
  const redirect = vi.fn()
  const showToast = vi.fn()
  const onAbandon = vi.fn()
  const availableLocations: AnchorLocationOption[] = [
    { id: 'loc-1', label: "Maya's Kitchen", sublabel: 'Oak Park' },
    { id: 'loc-2', label: 'Sunday Farmers Market' },
  ]

  const utils = render(
    <SellWalkthrough
      createDraft={createDraft}
      updateDraft={updateDraft}
      activate={activate}
      createLocation={createLocation}
      availableLocations={availableLocations}
      redirect={redirect}
      showToast={showToast}
      onAbandon={onAbandon}
      {...overrides}
    />,
  )

  return {
    ...utils,
    createDraft,
    updateDraft,
    activate,
    createLocation,
    redirect,
    showToast,
    onAbandon,
    availableLocations,
  }
}

async function clickContinue() {
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }))
  await waitFor(() => {
    // Spinner clears once the async settles.
    expect(screen.queryByTestId('continue-spinner')).not.toBeInTheDocument()
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('SellWalkthrough — six-step shape', () => {
  it('opens on step 1 (Brand name) with the 6-step indicator', () => {
    setup()
    expect(
      screen.getByRole('heading', { name: /Brand name/i }),
    ).toBeInTheDocument()
    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('aria-valuenow', '1')
    expect(progress).toHaveAttribute('aria-valuemax', '6')
  })

  it('blocks Continue when brand is empty and surfaces an inline field error', async () => {
    const { createDraft } = setup()
    await clickContinue()
    expect(
      screen.getByTestId('field-error-brand'),
    ).toHaveTextContent(/required/i)
    expect(createDraft).not.toHaveBeenCalled()
  })
})

describe('SellWalkthrough — step 1 fires group.create', () => {
  it('writes the draft Group on first Continue with brand text', async () => {
    const { createDraft } = setup()
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Sourdough' },
    })
    await clickContinue()
    expect(createDraft).toHaveBeenCalledTimes(1)
    expect(createDraft).toHaveBeenCalledWith({ brand: 'Oak Park Sourdough' })
  })

  it('advances to step 2 (Anchor Location) after step 1 succeeds', async () => {
    setup()
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Sourdough' },
    })
    await clickContinue()
    expect(
      screen.getByRole('heading', { name: /Anchor Location/i }),
    ).toBeInTheDocument()
  })
})

describe('SellWalkthrough — step 2 anchor Location', () => {
  async function advanceToAnchor() {
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Sourdough' },
    })
    await clickContinue()
  }

  it('lists saved Locations and selects on tap', async () => {
    setup()
    await advanceToAnchor()
    expect(screen.getByTestId('sell-anchor-options')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sell-anchor-option-loc-1'))
    expect(
      screen.getByTestId('sell-anchor-option-loc-1'),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('blocks Continue when no Location selected', async () => {
    const { updateDraft } = setup()
    await advanceToAnchor()
    await clickContinue()
    expect(
      screen.getByTestId('field-error-anchor'),
    ).toBeInTheDocument()
    expect(updateDraft).not.toHaveBeenCalled()
  })

  it('fires group.update_draft with anchorLocationId on Continue', async () => {
    const { updateDraft } = setup()
    await advanceToAnchor()
    fireEvent.click(screen.getByTestId('sell-anchor-option-loc-1'))
    await clickContinue()
    expect(updateDraft).toHaveBeenCalledWith({
      groupId: 'g-draft-1',
      anchorLocationId: 'loc-1',
    })
  })

  it('opens the AddEntityDrawer when "+ Add a new Location" tapped', async () => {
    setup()
    await advanceToAnchor()
    fireEvent.click(screen.getByTestId('sell-anchor-add-new'))
    expect(screen.getByTestId('add-entity-drawer-overlay')).toBeInTheDocument()
    expect(screen.getByText(/Add a Location/i)).toBeInTheDocument()
  })

  it('auto-selects new Location after AddEntityDrawer save and stays paused on anchor step', async () => {
    geocode.mockResolvedValue([
      { name: '123 Main St, Sacramento, CA', coordinates: [-121.5, 38.58] },
    ])
    const { createLocation } = setup()
    await advanceToAnchor()
    fireEvent.click(screen.getByTestId('sell-anchor-add-new'))
    fireEvent.change(screen.getByTestId('sell-add-location-input'), {
      target: { value: 'Home Kitchen' },
    })
    fireEvent.change(screen.getByTestId('sell-anchor-address-input'), {
      target: { value: '123 Main' },
    })
    await vi.advanceTimersByTimeAsync(350)
    await waitFor(() =>
      expect(screen.getByTestId('sell-anchor-address-suggestion-0')).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByTestId('sell-anchor-address-suggestion-0'))
    fireEvent.click(screen.getByRole('button', { name: /Add and select/i }))
    await waitFor(() => {
      expect(createLocation).toHaveBeenCalledWith({
        label: 'Home Kitchen',
        address: {
          geographyWkt: 'SRID=4326;POINT(-121.5 38.58)',
          resolvedAddressText: '123 Main St, Sacramento, CA',
        },
      })
    })
    // Drawer closed.
    await waitFor(() => {
      expect(
        screen.queryByTestId('add-entity-drawer-overlay'),
      ).not.toBeInTheDocument()
    })
    // Parent composer still on step 2 — does NOT auto-advance.
    expect(
      screen.getByRole('heading', { name: /Anchor Location/i }),
    ).toBeInTheDocument()
    // Picker still mounted, ready for the user to tap Continue.
  })

  it('cannot save the new Location until a suggested address (or a neighbourhood) is chosen', async () => {
    const { createLocation } = setup()
    await advanceToAnchor()
    fireEvent.click(screen.getByTestId('sell-anchor-add-new'))
    fireEvent.change(screen.getByTestId('sell-add-location-input'), {
      target: { value: 'Home Kitchen' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add and select/i }))
    await waitFor(() => expect(screen.getByText(/choose a suggested address/i)).toBeInTheDocument())
    expect(createLocation).not.toHaveBeenCalled()
  })
})

describe('SellWalkthrough — step 3 Tags (T159)', () => {
  async function advanceToTags() {
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Sourdough' },
    })
    await clickContinue()
    fireEvent.click(screen.getByTestId('sell-anchor-option-loc-1'))
    await clickContinue()
  }

  const type = (value: string) =>
    fireEvent.change(screen.getByTestId('sell-tag-input'), { target: { value } })

  it('offers a free text input, not a fixed list — creators create their own tags', async () => {
    setup()
    await advanceToTags()
    expect(screen.getByTestId('sell-tag-input')).toBeInTheDocument()
    // The twelve are retired; nothing should offer them.
    expect(screen.queryByTestId('sell-category-option-Food & Drink')).toBeNull()
    expect(screen.queryByTestId('sell-category-option-other')).toBeNull()
  })

  it('blocks Continue with no tag, and persists nothing mid-draft', async () => {
    const { updateDraft } = setup()
    await advanceToTags()
    updateDraft.mockClear()
    await clickContinue()
    expect(screen.getByTestId('field-error-tags')).toBeInTheDocument()
    expect(updateDraft).not.toHaveBeenCalled()
  })

  it('adds a tag with the Add button and shows it', async () => {
    setup()
    await advanceToTags()
    type('sourdough')
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    expect(within(screen.getByTestId('sell-tag-list')).getByText('sourdough')).toBeInTheDocument()
  })

  it('adds a tag on Enter without submitting the step', async () => {
    setup()
    await advanceToTags()
    type('sourdough')
    fireEvent.keyDown(screen.getByTestId('sell-tag-input'), { key: 'Enter' })
    expect(within(screen.getByTestId('sell-tag-list')).getByText('sourdough')).toBeInTheDocument()
    // Still on the tag step — Enter committed a tag, it did not advance.
    expect(screen.getByTestId('sell-tag-input')).toBeInTheDocument()
  })

  it('commits a tag on a typed comma, so a typed list does not become one tag', async () => {
    setup()
    await advanceToTags()
    type('bread,')
    expect(within(screen.getByTestId('sell-tag-list')).getByText('bread')).toBeInTheDocument()
    expect(screen.queryByText('bread,')).toBeNull()
  })

  it('does not add the same tag twice, whatever the casing or spacing', async () => {
    setup()
    await advanceToTags()
    type('Sourdough')
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    type(' sourdough ')
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    expect(within(screen.getByTestId('sell-tag-list')).getAllByText(/sourdough/i)).toHaveLength(1)
  })

  it('refuses to add whitespace', async () => {
    setup()
    await advanceToTags()
    type('   ')
    expect(screen.getByTestId('sell-tag-add')).toBeDisabled()
  })

  it('removes a tag', async () => {
    setup()
    await advanceToTags()
    type('sourdough')
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    fireEvent.click(screen.getByTestId('sell-tag-remove-sourdough'))
    expect(screen.queryByTestId('sell-tag-list')).toBeNull()
  })

  it('one tag unblocks Continue and advances to About', async () => {
    setup()
    await advanceToTags()
    type('sourdough')
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    await clickContinue()
    expect(screen.getByRole('heading', { name: /^About$/i })).toBeInTheDocument()
  })

  it('accepts a word typed but not added — the creator did not change their mind', async () => {
    setup()
    await advanceToTags()
    type('sourdough')
    await clickContinue()
    expect(screen.getByRole('heading', { name: /^About$/i })).toBeInTheDocument()
  })
})

describe('SellWalkthrough — step 4 About (optional)', () => {
  async function advanceToAbout() {
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Sourdough' },
    })
    await clickContinue()
    fireEvent.click(screen.getByTestId('sell-anchor-option-loc-1'))
    await clickContinue()
    fireEvent.change(screen.getByTestId('sell-tag-input'), { target: { value: 'sourdough' } })
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    await clickContinue()
  }

  it('renders the About step with optional Skip link', async () => {
    setup()
    await advanceToAbout()
    expect(
      screen.getByRole('heading', { name: /^About$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Skip this step/i }),
    ).toBeInTheDocument()
  })

  it('fires group.update_draft with about text on Continue', async () => {
    const { updateDraft } = setup()
    await advanceToAbout()
    fireEvent.change(screen.getByTestId('sell-about-input'), {
      target: { value: 'I bake sourdough.' },
    })
    await clickContinue()
    expect(updateDraft).toHaveBeenLastCalledWith({
      groupId: 'g-draft-1',
      about: 'I bake sourdough.',
    })
  })
})

describe('SellWalkthrough — step 5 Locality (Tier 0, optional, UI-only)', () => {
  async function advanceToLocality() {
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Sourdough' },
    })
    await clickContinue()
    fireEvent.click(screen.getByTestId('sell-anchor-option-loc-1'))
    await clickContinue()
    fireEvent.change(screen.getByTestId('sell-tag-input'), { target: { value: 'sourdough' } })
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    await clickContinue()
    fireEvent.click(screen.getByRole('link', { name: /Skip this step/i }))
  }

  it('renders the Locality step with Skip', async () => {
    setup()
    await advanceToLocality()
    expect(
      screen.getByRole('heading', { name: /locally owned/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Skip this step/i }),
    ).toBeInTheDocument()
  })

  it('blocks Continue on a non-5-digit ZIP', async () => {
    setup()
    await advanceToLocality()
    fireEvent.change(screen.getByTestId('sell-locality-zip-input'), {
      target: { value: 'abc' },
    })
    await clickContinue()
    expect(screen.getByTestId('field-error-zip')).toBeInTheDocument()
  })

  it('does NOT persist the ZIP at b1 (substrate deferred to F037)', async () => {
    const { updateDraft } = setup()
    await advanceToLocality()
    updateDraft.mockClear()
    fireEvent.change(screen.getByTestId('sell-locality-zip-input'), {
      target: { value: '95817' },
    })
    await clickContinue()
    // No write call fires for the locality step.
    expect(updateDraft).not.toHaveBeenCalled()
  })
})

describe('SellWalkthrough — step 6 Review & activate', () => {
  async function advanceToReview(tags: string[] = ['sourdough']) {
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Sourdough' },
    })
    await clickContinue()
    fireEvent.click(screen.getByTestId('sell-anchor-option-loc-1'))
    await clickContinue()
    for (const tag of tags) {
      fireEvent.change(screen.getByTestId('sell-tag-input'), { target: { value: tag } })
      fireEvent.click(screen.getByTestId('sell-tag-add'))
    }
    await clickContinue()
    fireEvent.click(screen.getByRole('link', { name: /Skip this step/i }))
    fireEvent.click(screen.getByRole('link', { name: /Skip this step/i }))
  }

  it('renders the review list with brand, anchor, about, locality summaries', async () => {
    setup()
    await advanceToReview()
    const review = screen.getByTestId('sell-review-list')
    expect(review).toHaveTextContent(/Oak Park Sourdough/)
    expect(review).toHaveTextContent(/Maya's Kitchen/)
    expect(review).toHaveTextContent(/skipped/) // locality
  })

  it('final CTA reads "Create my shop"', async () => {
    setup()
    await advanceToReview()
    expect(
      screen.getByRole('button', { name: /Create my shop/i }),
    ).toBeInTheDocument()
  })

  it('fires group.activate with the chosen tags, redirects to the new Group URL, and toasts on success', async () => {
    const { activate, redirect, showToast } = setup()
    await advanceToReview()
    fireEvent.click(screen.getByRole('button', { name: /Create my shop/i }))
    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1))
    expect(activate).toHaveBeenCalledWith({
      groupId: 'g-draft-1',
      tags: ['sourdough'],
    })
    expect(redirect).toHaveBeenCalledWith(
      '/p/sacramento/g/oak-park-sourdough-abc1',
    )
    expect(showToast).toHaveBeenCalledWith('Your shop is live.')
  })

  it('sends every tag added, in the order they were added', async () => {
    const { activate } = setup()
    await advanceToReview(['sourdough', 'bread', 'pastry'])
    fireEvent.click(screen.getByRole('button', { name: /Create my shop/i }))
    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1))
    expect(activate).toHaveBeenCalledWith({
      groupId: 'g-draft-1',
      tags: ['sourdough', 'bread', 'pastry'],
    })
  })
})

describe('SellWalkthrough — back-edit brand does not double-create the draft', () => {
  it('uses update_draft (not create) when brand re-submitted after step 1 created the draft', async () => {
    const { createDraft, updateDraft } = setup()
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Sourdough' },
    })
    await clickContinue()
    expect(createDraft).toHaveBeenCalledTimes(1)
    // Step 2 is rendered. Back to step 1.
    fireEvent.click(screen.getByRole('button', { name: /^← Back$/i }))
    expect(
      screen.getByRole('heading', { name: /Brand name/i }),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Bakery' },
    })
    await clickContinue()
    // Critically: createDraft was NOT called a second time. Brand re-edit
    // routes through update_draft. M2 fix-now guard test.
    expect(createDraft).toHaveBeenCalledTimes(1)
    expect(updateDraft).toHaveBeenCalledWith({
      groupId: 'g-draft-1',
      brand: 'Oak Park Bakery',
    })
  })
})

describe('SellWalkthrough — resume', () => {
  it('mounts on the step the resume hint provides with prior fields populated', () => {
    setup({
      resume: {
        groupId: 'g-existing',
        brand: 'Oak Park Sourdough',
        anchorLocationId: 'loc-1',
        anchorLocationLabel: "Maya's Kitchen",
        about: '',
        resumeFromStep: 3, // About step (index shifted by the T144 Category step)
      },
    })
    expect(screen.getByRole('heading', { name: /^About$/i })).toBeInTheDocument()
  })

  it('uses the resumed draftGroupId for subsequent step writes', async () => {
    const { updateDraft } = setup({
      resume: {
        groupId: 'g-existing',
        brand: 'Oak Park Sourdough',
        anchorLocationId: 'loc-1',
        anchorLocationLabel: "Maya's Kitchen",
        about: '',
        resumeFromStep: 3,
      },
    })
    fireEvent.change(screen.getByTestId('sell-about-input'), {
      target: { value: 'updated' },
    })
    await clickContinue()
    expect(updateDraft).toHaveBeenCalledWith({
      groupId: 'g-existing',
      about: 'updated',
    })
  })
})
