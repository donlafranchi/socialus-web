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
vi.mock('@/lib/geocoding', () => ({
  geocode,
  // The component imports this to tell "cannot run" from "no match" (#107).
  GeocodingUnavailableError: class GeocodingUnavailableError extends Error {},
}))
vi.mock('@/app/_actions/location-actions', () => ({
  // Our own place search, stubbed: these tests are about the field, not the data.
  searchPlacesAction: vi.fn(async () => ({ ok: true, data: [] })),
  listNeighborhoodsAction: vi.fn(async () => []),
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
      memberId="member-1"
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

/** F087 — the flow now opens on "What are we creating?". The tests below were
 *  written for the steps after it, so they answer it first. Shop keeps their
 *  existing wording, which is what they already assert. */
async function answerPurpose(purpose: 'shop' | 'service' | 'group' = 'shop') {
  fireEvent.click(screen.getByTestId(`sell-purpose-${purpose}`))
  await clickContinue()
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

describe('SellWalkthrough — the question comes first', () => {
  it('opens on the question, not on a name field', () => {
    // F087 criterion 2: purpose is chosen first, before any other field.
    setup()
    expect(
      screen.getByRole('heading', { name: /What are we creating\?/i }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('sell-brand-input')).not.toBeInTheDocument()
    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('aria-valuenow', '1')
    expect(progress).toHaveAttribute('aria-valuemax', '6')
  })

  it('offers exactly the three Don named, none pre-selected', () => {
    setup()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    for (const r of radios) expect(r).not.toBeChecked()
    expect(screen.getByText('Opening a shop')).toBeInTheDocument()
    expect(screen.getByText('Offering a service')).toBeInTheDocument()
    expect(screen.getByText('Creating a group for meetups')).toBeInTheDocument()
  })

  it('will not advance until one is picked', async () => {
    setup()
    await clickContinue()
    expect(screen.getByTestId('field-error-purpose')).toBeInTheDocument()
    expect(screen.queryByTestId('sell-brand-input')).not.toBeInTheDocument()
  })

  it('names the thing in the words of the answer', async () => {
    setup()
    await answerPurpose('group')
    expect(screen.getByRole('heading', { name: /Name your group/i })).toBeInTheDocument()
  })

  it('never shows the person the word Page', async () => {
    const { container } = setup()
    await answerPurpose('service')
    expect(container.textContent).not.toMatch(/\bPage\b/)
  })

  it('blocks Continue when brand is empty and surfaces an inline field error', async () => {
    const { createDraft } = setup()
    await answerPurpose()
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
    await answerPurpose()
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Sourdough' },
    })
    await clickContinue()
    expect(createDraft).toHaveBeenCalledTimes(1)
    expect(createDraft).toHaveBeenCalledWith({ brand: 'Oak Park Sourdough' })
  })

  it('advances to step 2 (Anchor Location) after step 1 succeeds', async () => {
    setup()
    await answerPurpose()
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
    await answerPurpose()
    await advanceToAnchor()
    expect(screen.getByTestId('sell-anchor-options')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sell-anchor-option-loc-1'))
    expect(
      screen.getByTestId('sell-anchor-option-loc-1'),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('blocks Continue when no Location selected', async () => {
    const { updateDraft } = setup()
    await answerPurpose()
    await advanceToAnchor()
    await clickContinue()
    expect(
      screen.getByTestId('field-error-anchor'),
    ).toBeInTheDocument()
    expect(updateDraft).not.toHaveBeenCalled()
  })

  it('fires group.update_draft with anchorLocationId on Continue', async () => {
    const { updateDraft } = setup()
    await answerPurpose()
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
    await answerPurpose()
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
    await answerPurpose()
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
    await answerPurpose()
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

  it('prompts with farmers market examples rather than explaining what a tag is', async () => {
    // Don's call: a creator knows what they offer and most already market
    // elsewhere, so the register is the prompt. Examples are a placeholder,
    // never a default — nothing is prefilled and nothing is submitted.
    setup()
    await answerPurpose()
    await advanceToTags()
    const input = screen.getByTestId('sell-tag-input')
    expect(input).toHaveAttribute('placeholder', 'sourdough, honey, eggs, soap')
    expect(input).toHaveValue('')
    await clickContinue()
    expect(screen.getByTestId('field-error-tags')).toBeInTheDocument()
  })

  it('offers a free text input, not a fixed list — creators create their own tags', async () => {
    setup()
    await answerPurpose()
    await advanceToTags()
    expect(screen.getByTestId('sell-tag-input')).toBeInTheDocument()
    // The twelve are retired; nothing should offer them.
    expect(screen.queryByTestId('sell-category-option-Food & Drink')).toBeNull()
    expect(screen.queryByTestId('sell-category-option-other')).toBeNull()
  })

  it('blocks Continue with no tag, and persists nothing mid-draft', async () => {
    const { updateDraft } = setup()
    await answerPurpose()
    await advanceToTags()
    updateDraft.mockClear()
    await clickContinue()
    expect(screen.getByTestId('field-error-tags')).toBeInTheDocument()
    expect(updateDraft).not.toHaveBeenCalled()
  })

  it('adds a tag with the Add button and shows it', async () => {
    setup()
    await answerPurpose()
    await advanceToTags()
    type('sourdough')
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    expect(within(screen.getByTestId('sell-tag-list')).getByText('#sourdough')).toBeInTheDocument()
  })

  it('adds a tag on Enter without submitting the step', async () => {
    setup()
    await answerPurpose()
    await advanceToTags()
    type('sourdough')
    fireEvent.keyDown(screen.getByTestId('sell-tag-input'), { key: 'Enter' })
    expect(within(screen.getByTestId('sell-tag-list')).getByText('#sourdough')).toBeInTheDocument()
    // Still on the tag step — Enter committed a tag, it did not advance.
    expect(screen.getByTestId('sell-tag-input')).toBeInTheDocument()
  })

  it('commits a tag on a typed comma, so a typed list does not become one tag', async () => {
    setup()
    await answerPurpose()
    await advanceToTags()
    type('bread,')
    expect(within(screen.getByTestId('sell-tag-list')).getByText('#bread')).toBeInTheDocument()
    expect(screen.queryByText('bread,')).toBeNull()
  })

  // #316 — the create flow's tag box behaves like a hashtag box too.
  it('ignores a typed # and commits on a space, shown as #tag', async () => {
    setup()
    await answerPurpose()
    await advanceToTags()
    type('#bread')
    expect(screen.getByTestId('sell-tag-input')).toHaveValue('bread')
    type('bread ')
    expect(within(screen.getByTestId('sell-tag-list')).getByText('#bread')).toBeInTheDocument()
  })

  it('does not add the same tag twice, whatever the casing or spacing', async () => {
    setup()
    await answerPurpose()
    await advanceToTags()
    type('Sourdough')
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    type(' sourdough ')
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    expect(within(screen.getByTestId('sell-tag-list')).getAllByText(/sourdough/i)).toHaveLength(1)
  })

  it('refuses to add whitespace', async () => {
    setup()
    await answerPurpose()
    await advanceToTags()
    type('   ')
    expect(screen.getByTestId('sell-tag-add')).toBeDisabled()
  })

  it('removes a tag', async () => {
    setup()
    await answerPurpose()
    await advanceToTags()
    type('sourdough')
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    fireEvent.click(screen.getByTestId('sell-tag-remove-sourdough'))
    expect(screen.queryByTestId('sell-tag-list')).toBeNull()
  })

  it('one tag unblocks Continue and advances to About', async () => {
    setup()
    await answerPurpose()
    await advanceToTags()
    type('sourdough')
    fireEvent.click(screen.getByTestId('sell-tag-add'))
    await clickContinue()
    expect(screen.getByRole('heading', { name: /^About$/i })).toBeInTheDocument()
  })

  it('accepts a word typed but not added — the creator did not change their mind', async () => {
    setup()
    await answerPurpose()
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
    await answerPurpose()
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
    await answerPurpose()
    await advanceToAbout()
    fireEvent.change(screen.getByTestId('sell-about-input'), {
      target: { value: 'I bake sourdough.' },
    })
    await clickContinue()
    // F070 · T145 — the About step now also carries the photo. `null` is
    // sent, not omitted: omitting would mean "leave it alone" and make
    // removing a photo impossible.
    expect(updateDraft).toHaveBeenLastCalledWith({
      groupId: 'g-draft-1',
      about: 'I bake sourdough.',
      photoUrl: null,
      socialLinks: {},
    })
  })
})

// #110 — the Locality step is gone. Don ruled business fields out of Page
// creation; DECISIONS.md 2026-09-07 already said creation carries "no ZIP
// prompt". The step was UI-only (onAdvance returned early, the ZIP was
// discarded), so nothing it did is lost. Its tests go with it rather than
// being adapted to describe behaviour that no longer exists.

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
    // One optional step now, not two: Locality is gone (#110).
    fireEvent.click(screen.getByRole('link', { name: /Skip this step/i }))
  }

  it('renders the review list with name, anchor and about summaries', async () => {
    setup()
    await answerPurpose()
    await advanceToReview()
    const review = screen.getByTestId('sell-review-list')
    expect(review).toHaveTextContent(/Oak Park Sourdough/)
    expect(review).toHaveTextContent(/Maya's Kitchen/)
    // About was skipped, so it reads (none). There is no locality row to
    // summarise any more (#110).
    expect(review).toHaveTextContent(/none/)
    expect(review).not.toHaveTextContent(/ZIP/i)
  })

  it('final CTA reads "Create my shop" for the shop answer', async () => {
    setup()
    await answerPurpose()
    await advanceToReview()
    expect(
      screen.getByRole('button', { name: /Create my shop/i }),
    ).toBeInTheDocument()
  })

  it('fires group.activate with the chosen tags, redirects to the new Group URL, and toasts on success', async () => {
    const { activate, redirect, showToast } = setup()
    await answerPurpose()
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
    await answerPurpose()
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
    await answerPurpose()
    fireEvent.change(screen.getByTestId('sell-brand-input'), {
      target: { value: 'Oak Park Sourdough' },
    })
    await clickContinue()
    expect(createDraft).toHaveBeenCalledTimes(1)
    // Step 2 is rendered. Back to step 1.
    fireEvent.click(screen.getByRole('button', { name: /^← Back$/i }))
    expect(
      screen.getByRole('heading', { name: /Name your shop/i }),
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
        resumeFromStep: 4, // About step (index shifted again by F087's question)
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
        resumeFromStep: 4,
      },
    })
    fireEvent.change(screen.getByTestId('sell-about-input'), {
      target: { value: 'updated' },
    })
    await clickContinue()
    expect(updateDraft).toHaveBeenCalledWith({
      groupId: 'g-existing',
      about: 'updated',
      photoUrl: null,
      socialLinks: {},
    })
  })
})
