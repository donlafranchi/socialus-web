'use client'

// T073 — <SellWalkthrough> — the Sell-side surface for F036.
// Spec:   planning/now/scenario-F036-member-creates-business-group-via-sell-walkthrough.md
// Ticket: development/tickets/T073-sell-walkthrough-and-you-sell-cta.md
// DLS:    product/ui/design-language.md § Component recipes → Multi-step composer
//
// Composes <MultiStepComposer> with six steps:
//   1. Brand name              → group.create on Continue (writes draft Group)
//   2. Anchor Location         → group.update_draft + AddEntityDrawer sub-flow for "+ Add a new"
//   3. Category (T144)         → held in composer state only, sent with group.activate at publish
//   4. About (optional)        → group.update_draft on Continue
//   5. Locality (Tier 0)       → UI-only at b1 (substrate ships with F037; see DEVIATIONS)
//   6. Review & done           → group.activate(category) → redirect to /p/[...place]/g/[slug]
//
// The composer is presentational + control-flow only (per T071) — this file
// supplies steps, persistence callbacks, and the redirect. Server-action
// thunks (createDraft / updateDraft / activate / createLocation) are passed
// in by the parent so the component is testable in isolation.

import { useState, useCallback } from 'react'
import {
  MultiStepComposer,
  type StepDef,
} from '@/components/composer/MultiStepComposer'
import { AddEntityDrawer } from '@/components/composer/AddEntityDrawer'
import {
  LocationPlaceFields,
  initialLocationPlaceFieldsState,
  isLocationPlaceFieldsComplete,
  type LocationPlaceFieldsState,
} from '@/components/locations/LocationPlaceFields'
import type { CreateLocationInput } from '@/app/you/sell/actions'
import { PAGE_CATEGORIES, type PageCategory } from '@/lib/groups/page-categories'

export interface AnchorLocationOption {
  id: string
  label: string
  /** Optional secondary line (e.g., "Sacramento, CA"). */
  sublabel?: string
}

export interface SellWalkthroughState {
  /** Set after the brand-name step writes the draft. Steps 2+ patch it via group.update_draft. */
  draftGroupId: string | null
  brand: string
  anchorLocationId: string | null
  /** Local-only label for the picker UI; not persisted. */
  anchorLocationLabel: string | null
  /** T144 — deliberately NOT patched via group.update_draft. Deferred to
   *  the final activate() call (see onComplete) so changing your mind
   *  mid-draft never writes more than the one final choice — see T144
   *  Completion notes on the resume tradeoff this costs. */
  /** `'other'` is an explicit radio selection, distinct from `null`
   *  (nothing chosen yet) — keeps "is 'Something else' selected" a plain
   *  equality check instead of something inferred from whether free text
   *  happens to be non-empty, which breaks the moment that text is cleared. */
  category: PageCategory | 'other' | null
  categoryOtherText: string
  about: string
  /** Tier 0 ZIP. UI-only at b1 (no member_business_jurisdictions table yet — F037). */
  localityZip: string
}

export interface SellWalkthroughHandlers {
  /** Called on step-1 Continue. Returns the new draft Group id. */
  createDraft: (input: { brand: string }) => Promise<{ groupId: string }>
  /** Called on steps 2–4 Continue with the diff for that step. */
  updateDraft: (input: {
    groupId: string
    anchorLocationId?: string
    about?: string
    /** Brand re-edit from Back navigation. Not normally sent. */
    brand?: string
  }) => Promise<void>
  /** Called on final-step "Create my shop". Returns the place-scoped Group URL. */
  activate: (input: {
    groupId: string
    category: { term: PageCategory } | { otherText: string }
  }) => Promise<{ destinationUrl: string }>
  /** Sub-flow: inline-add a new Location. Returns the new Location's id + label. */
  createLocation: (input: CreateLocationInput) => Promise<{ id: string; label: string }>
  /** Available saved Locations for the anchor picker. */
  availableLocations: AnchorLocationOption[]
  /** Caller's redirect mechanism (router.push in production, a spy in tests). */
  redirect: (url: string) => void
  /** Caller's toast mechanism. */
  showToast: (msg: string) => void
}

export interface SellWalkthroughProps extends SellWalkthroughHandlers {
  /** Optional draft state on mount (resume path). */
  resume?: {
    groupId: string
    brand: string
    anchorLocationId: string | null
    anchorLocationLabel: string | null
    about: string
    /** 0-indexed step the composer should resume on. */
    resumeFromStep: number
  }
  onAbandon: () => void
}

const TOAST_SUCCESS = 'Your shop is live.'

function emptyState(): SellWalkthroughState {
  return {
    draftGroupId: null,
    brand: '',
    anchorLocationId: null,
    anchorLocationLabel: null,
    category: null,
    categoryOtherText: '',
    about: '',
    localityZip: '',
  }
}

export function SellWalkthrough({
  resume,
  createDraft,
  updateDraft,
  activate,
  createLocation,
  availableLocations,
  redirect,
  showToast,
  onAbandon,
}: SellWalkthroughProps) {
  // The composer is uncontrolled (owns its own `state` via initialState).
  // We use a top-level shadow state only for the AddEntityDrawer mount + the
  // initialState seed; the composer's setState drives the per-step inputs.
  const initialState: SellWalkthroughState = resume
    ? {
        draftGroupId: resume.groupId,
        brand: resume.brand,
        anchorLocationId: resume.anchorLocationId,
        anchorLocationLabel: resume.anchorLocationLabel,
        // T144 — category is never persisted during drafting (see the
        // field's own comment above), so a resumed session has no
        // server-side value to restore it from. The Member re-picks it.
        category: null,
        categoryOtherText: '',
        about: resume.about,
        localityZip: '',
      }
    : emptyState()

  // Step definitions — kept inline so the captures (handlers above) bind
  // cleanly. The composer is generic over S; we instantiate with our state.
  const steps: StepDef<SellWalkthroughState>[] = [
    // 1. Brand name
    {
      id: 'brand',
      title: 'Brand name',
      helper: "What should your shop be called?",
      render: (state, setState) => (
        <label className="block">
          <span className="text-sm font-medium text-[var(--color-fg)]">Brand name</span>
          <input
            data-testid="sell-brand-input"
            className="input mt-1 w-full"
            placeholder="Oak Park Sourdough"
            value={state.brand}
            onChange={(e) => setState({ ...state, brand: e.target.value })}
          />
        </label>
      ),
      validate: (state) =>
        state.brand.trim().length > 0
          ? { ok: true }
          : { ok: false, errors: { brand: 'Brand name is required' } },
    },

    // 2. Anchor Location
    {
      id: 'anchor',
      title: 'Anchor Location',
      helper: 'Where is your shop primarily based?',
      render: (state, setState) => (
        <AnchorLocationStep
          state={state}
          setState={setState}
          available={availableLocations}
          createLocation={createLocation}
        />
      ),
      validate: (state) =>
        state.anchorLocationId
          ? { ok: true }
          : { ok: false, errors: { anchor: 'Pick or add an anchor Location' } },
    },

    // 3. Category (T144)
    {
      id: 'category',
      title: 'What you do',
      helper: 'Pick the one that fits best.',
      render: (state, setState) => (
        <CategoryStep state={state} setState={setState} />
      ),
      validate: (state) => {
        if (state.category === 'other') {
          return state.categoryOtherText.trim().length > 0
            ? { ok: true }
            : { ok: false, errors: { category: 'In your own words, say what you do' } }
        }
        return state.category
          ? { ok: true }
          : { ok: false, errors: { category: 'Choose a category' } }
      },
    },

    // 4. About (optional)
    {
      id: 'about',
      title: 'About',
      helper: 'A short public description visitors will see (optional).',
      isOptional: true,
      render: (state, setState) => (
        <label className="block">
          <span className="text-sm font-medium text-[var(--color-fg)]">About</span>
          <textarea
            data-testid="sell-about-input"
            aria-label="Public description"
            className="input mt-1 w-full min-h-[6rem]"
            placeholder="I bake sourdough from a home kitchen and sell at the Sunday market."
            value={state.about}
            onChange={(e) => setState({ ...state, about: e.target.value })}
          />
        </label>
      ),
      validate: () => ({ ok: true }),
    },

    // 5. Locality claim (Tier 0) — UI-only at b1 (no substrate).
    {
      id: 'locality',
      title: 'Are you locally owned?',
      helper:
        'Add your ZIP to claim Locally Owned status (Tier 0 — self-attested). You can do this later from Shop settings.',
      isOptional: true,
      render: (state, setState) => (
        <label className="block">
          <span className="text-sm font-medium text-[var(--color-fg)]">ZIP code</span>
          <input
            data-testid="sell-locality-zip-input"
            aria-label="ZIP code"
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={10}
            className="input mt-1 w-full"
            placeholder="95817"
            value={state.localityZip}
            onChange={(e) =>
              setState({ ...state, localityZip: e.target.value })
            }
          />
          <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
            Tier 0 is self-attested — the badge reads <em>Claimed</em>. Upgrade
            to <em>Verified</em> or <em>Documented</em> later if you choose.
          </p>
        </label>
      ),
      validate: (state) => {
        // Optional, but if the user typed something it must be 5 digits.
        const v = state.localityZip.trim()
        if (v.length === 0) return { ok: true }
        return /^\d{5}$/.test(v)
          ? { ok: true }
          : { ok: false, errors: { zip: 'Use a 5-digit ZIP, or skip this step.' } }
      },
    },

    // 6. Review & done
    {
      id: 'review',
      title: 'Review',
      helper: 'Confirm the details below, then create your shop.',
      finalLabel: 'Create my shop',
      render: (state) => (
        <ul data-testid="sell-review-list" className="text-sm space-y-2">
          <li>
            <strong>Brand:</strong> {state.brand}
          </li>
          <li>
            <strong>Anchor Location:</strong>{' '}
            {state.anchorLocationLabel ?? '(set)'}
          </li>
          <li>
            <strong>About:</strong>{' '}
            {state.about ? (
              state.about
            ) : (
              <em className="text-[var(--color-fg-muted)]">(none)</em>
            )}
          </li>
          <li>
            <strong>Locally owned ZIP:</strong>{' '}
            {state.localityZip ? (
              state.localityZip
            ) : (
              <em className="text-[var(--color-fg-muted)]">(skipped)</em>
            )}
          </li>
        </ul>
      ),
      validate: () => ({ ok: true }),
    },
  ]

  // Per-step persistence. The composer fires onAdvance(stepId, state) on
  // each Continue (except the final step, which fires onComplete).
  //
  // We keep an in-component shadow of draftGroupId so step 2+ can patch the
  // right row even though the composer's state is the source of truth for
  // visible fields. The composer carries draftGroupId in state too, so a
  // resume re-mount restores it cleanly.
  const [shadowDraftId, setShadowDraftId] = useState<string | null>(
    resume?.groupId ?? null,
  )

  const onAdvance = useCallback(
    async (stepId: string, state: SellWalkthroughState) => {
      if (stepId === 'brand') {
        // Step 1 — group.create. Writes the spine + group_businesses +
        // founder membership + group.created event + group.member_joined
        // event in one transaction (per groups.md and T070 handler).
        // M2 fix-now: also consult shadowDraftId — the composer's `state`
        // never receives the new draftGroupId (createDraft can't reach
        // the composer's setState from onAdvance), so a Back-then-Continue
        // re-edit of brand would re-fire createDraft and create a second
        // draft Group without this guard.
        const existingId = state.draftGroupId ?? shadowDraftId
        if (existingId) {
          await updateDraft({
            groupId: existingId,
            brand: state.brand,
          })
          return
        }
        const { groupId } = await createDraft({ brand: state.brand })
        // Mutate the composer's state via the next render — we can't reach
        // back into the composer's setState from here. The composer will
        // call onAdvance with the still-incomplete state; we surface
        // draftGroupId by stashing it for subsequent calls.
        setShadowDraftId(groupId)
        // The composer's internal state is the source of truth for visible
        // fields; for draftGroupId we keep it in component-scoped state
        // (shadowDraftId). Steps 2–4 use shadowDraftId via the closures
        // below — see resolveDraftId.
        return
      }

      const draftGroupId = resolveDraftId(state, shadowDraftId)
      if (!draftGroupId) {
        // Defensive — shouldn't happen if step 1 succeeded.
        throw new Error(
          'SellWalkthrough.onAdvance: draftGroupId missing on step ' + stepId,
        )
      }

      if (stepId === 'anchor') {
        await updateDraft({
          groupId: draftGroupId,
          anchorLocationId: state.anchorLocationId ?? undefined,
        })
        return
      }
      if (stepId === 'category') {
        // T144 — deliberately not patched via group.update_draft. Held in
        // composer state only and sent with the final activate() call, so
        // changing your mind mid-draft never leaves a trail of abandoned
        // "Something else" suggestion rows (see the field's own comment).
        return
      }
      if (stepId === 'about') {
        await updateDraft({
          groupId: draftGroupId,
          about: state.about,
        })
        return
      }
      if (stepId === 'locality') {
        // No substrate at b1 — see DEVIATIONS. Step is UI-only; collected
        // ZIP discarded on submit. F037 will retro-fit the persistence path.
        return
      }
    },
    [createDraft, updateDraft, shadowDraftId],
  )

  const onComplete = useCallback(
    async (state: SellWalkthroughState) => {
      const draftGroupId = resolveDraftId(state, shadowDraftId)
      if (!draftGroupId) {
        throw new Error('SellWalkthrough.onComplete: draftGroupId missing')
      }
      const category: { term: PageCategory } | { otherText: string } =
        state.category === 'other' || state.category === null
          ? { otherText: state.categoryOtherText.trim() }
          : { term: state.category }
      const { destinationUrl } = await activate({ groupId: draftGroupId, category })
      // Composer is presentational — it does not navigate. We do.
      redirect(destinationUrl)
      showToast(TOAST_SUCCESS)
      return { destinationUrl }
    },
    [activate, redirect, showToast, shadowDraftId],
  )

  return (
    <MultiStepComposer<SellWalkthroughState>
      steps={steps}
      initialState={initialState}
      resumeFromStep={resume?.resumeFromStep ?? 0}
      onAdvance={onAdvance}
      onComplete={onComplete}
      onAbandon={onAbandon}
      // T073b: dialog accessible name must NOT match any step input's label
      // (e.g. "Brand name") or Playwright's getByLabel resolves to both.
      dialogLabel="Set up your shop"
    />
  )
}

// Resolve the right draftGroupId for steps 2+. Prefer composer state (a
// resume mount populated it from props); fall back to the shadow (set by
// step 1's createDraft response). Both must agree once step 1 has run.
function resolveDraftId(
  state: SellWalkthroughState,
  shadow: string | null,
): string | null {
  return state.draftGroupId ?? shadow
}

/** Step-3 category picker (T144). Native radios for the fixed twelve — a
 *  real radio group gives arrow-key navigation and one tab stop for the
 *  whole set for free, which is exactly what review binding note calls
 *  for ("thirteen tappable divs is the failure mode here"). "Something
 *  else" is the thirteenth option; choosing it reveals a text input. */
function CategoryStep({
  state,
  setState,
}: {
  state: SellWalkthroughState
  setState: (next: SellWalkthroughState) => void
}) {
  const isOther = state.category === 'other'
  const selected = state.category ?? ''

  function selectTerm(term: PageCategory) {
    setState({ ...state, category: term, categoryOtherText: '' })
  }

  function selectOther() {
    setState({ ...state, category: 'other' })
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-[var(--color-fg)]">What you do</legend>
      <div
        role="radiogroup"
        aria-label="What you do"
        className="mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto"
      >
        {PAGE_CATEGORIES.map((term) => (
          <label
            key={term}
            className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm hover:bg-neutral-50"
          >
            <input
              type="radio"
              name="sell-category"
              data-testid={`sell-category-option-${term}`}
              value={term}
              checked={selected === term}
              onChange={() => selectTerm(term)}
            />
            {term}
          </label>
        ))}
        <div className="mt-3 border-t border-neutral-200 pt-3">
          <label className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm hover:bg-neutral-50">
            <input
              type="radio"
              name="sell-category"
              data-testid="sell-category-option-other"
              value="other"
              checked={selected === 'other'}
              onChange={selectOther}
            />
            Something else
          </label>
        </div>
      </div>
      {isOther && (
        <div role="status" className="mt-2">
          <label className="block">
            <span className="text-sm font-medium text-[var(--color-fg)]">
              In your own words — what do you do?
            </span>
            <input
              data-testid="sell-category-other-input"
              aria-label="In your own words — what do you do?"
              className="input mt-1 w-full"
              autoFocus
              value={state.categoryOtherText}
              onChange={(e) => setState({ ...state, categoryOtherText: e.target.value })}
            />
          </label>
        </div>
      )}
    </fieldset>
  )
}

/** Step-2 picker. List of saved Locations + a "+ Add a new Location" row that
 *  opens the AddEntityDrawer sub-flow. On Save, the new Location auto-selects
 *  and the user stays paused on the anchor step (per DLS § Add new entity
 *  inside a composer — parent composer does NOT auto-advance). */
function AnchorLocationStep({
  state,
  setState,
  available,
  createLocation,
}: {
  state: SellWalkthroughState
  setState: (next: SellWalkthroughState) => void
  available: AnchorLocationOption[]
  createLocation: (input: CreateLocationInput) => Promise<{ id: string; label: string }>
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  // T073b fix-forward: track Locations the user creates inline so the
  // picker shows them post-save. AddEntityDrawer.onSaved only hands back
  // the new id, not the label — without local state the auto-selected
  // entry has nothing visible to confirm the save. Eval :327 asserts the
  // label text is rendered after the drawer closes.
  const [addedLocations, setAddedLocations] = useState<AnchorLocationOption[]>(
    [],
  )
  const allOptions: AnchorLocationOption[] = [...available, ...addedLocations]

  return (
    <div>
      <ul
        role="listbox"
        aria-label="Anchor Location options"
        data-testid="sell-anchor-options"
        className="space-y-2"
      >
        {allOptions.map((loc) => {
          const selected = state.anchorLocationId === loc.id
          return (
            <li key={loc.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                data-testid={`sell-anchor-option-${loc.id}`}
                onClick={() =>
                  setState({
                    ...state,
                    anchorLocationId: loc.id,
                    anchorLocationLabel: loc.label,
                  })
                }
                className={`w-full text-left rounded-lg border px-4 py-3 text-sm ${
                  selected
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-tint)]'
                    : 'border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <div className="font-medium">{loc.label}</div>
                {loc.sublabel && (
                  <div className="text-xs text-[var(--color-fg-muted)]">
                    {loc.sublabel}
                  </div>
                )}
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            data-testid="sell-anchor-add-new"
            onClick={() => setDrawerOpen(true)}
            className="w-full text-left rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-sm text-[var(--color-accent)] hover:bg-neutral-50"
          >
            + Add a new Location
          </button>
        </li>
      </ul>

      {drawerOpen && (
        <AddEntityDrawer<{ label: string; place: LocationPlaceFieldsState }>
          title="Add a Location"
          initialState={{ label: '', place: initialLocationPlaceFieldsState }}
          render={(s, set) => (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-[var(--color-fg)]">
                  Location name
                </span>
                <input
                  data-testid="sell-add-location-input"
                  aria-label="Location name"
                  className="input mt-1 w-full"
                  placeholder="Maya's Kitchen"
                  value={s.label}
                  onChange={(e) => set({ ...s, label: e.target.value })}
                />
              </label>
              <LocationPlaceFields
                state={s.place}
                setState={(place) => set({ ...s, place })}
                idPrefix="sell-anchor"
              />
            </div>
          )}
          validate={(s) => {
            const errors: Record<string, string> = {}
            if (s.label.trim().length === 0) errors.label = 'Name is required'
            if (!isLocationPlaceFieldsComplete(s.place)) {
              errors.place =
                s.place.mode === 'address' ? 'Choose a suggested address' : 'Choose a neighbourhood'
            }
            return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors }
          }}
          onSave={async (s) => {
            const input: CreateLocationInput =
              s.place.mode === 'address' && s.place.selectedAddress
                ? {
                    label: s.label.trim(),
                    address: {
                      geographyWkt: `SRID=4326;POINT(${s.place.selectedAddress.coordinates[0]} ${s.place.selectedAddress.coordinates[1]})`,
                      resolvedAddressText: s.place.selectedAddress.name,
                    },
                  }
                : { label: s.label.trim(), neighborhoodId: s.place.neighborhoodId! }
            const created = await createLocation(input)
            // Append to local options so the picker renders it immediately
            // and the post-save selection has a visible label. Per DLS:
            // parent composer stays paused at this step with the new entity
            // pre-selected so the user just taps Continue.
            setAddedLocations((prev) =>
              prev.some((l) => l.id === created.id)
                ? prev
                : [...prev, { id: created.id, label: created.label }],
            )
            setState({
              ...state,
              anchorLocationId: created.id,
              anchorLocationLabel: created.label,
            })
            return { id: created.id }
          }}
          onCancel={() => setDrawerOpen(false)}
          onSaved={() => {
            // Selection + options-list extension already happened in onSave
            // (so the picker re-renders with the new row by the time the
            // drawer unmounts). Just close.
            setDrawerOpen(false)
          }}
        />
      )}
    </div>
  )
}
