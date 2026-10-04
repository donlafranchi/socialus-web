'use client'

// T073 — <SellWalkthrough> — the Sell-side surface for F036.
// Spec:   planning/now/scenario-F036-member-creates-business-group-via-sell-walkthrough.md
// Ticket: development/tickets/T073-sell-walkthrough-and-you-sell-cta.md
// DLS:    product/ui/design-language.md § Component recipes → Multi-step composer
//
// Composes <MultiStepComposer> with six steps:
//   1. Brand name              → group.create on Continue (writes draft Group)
//   2. Anchor Location         → group.update_draft + AddEntityDrawer sub-flow for "+ Add a new"
//   3. Tags (T159)              → held in composer state only, sent with group.activate at publish
//   4. About (optional)        → group.update_draft on Continue
//   5. Locality (Tier 0)       → UI-only at b1 (substrate ships with F037; see DEVIATIONS)
//   6. Review & done           → group.activate(tags) → redirect to /p/[...place]/g/[slug]
//
// The composer is presentational + control-flow only (per T071) — this file
// supplies steps, persistence callbacks, and the redirect. Server-action
// thunks (createDraft / updateDraft / activate / createLocation) are passed
// in by the parent so the component is testable in isolation.

import { PostingSafetyNote } from '@/components/PostingSafetyNote'
import { useState, useCallback } from 'react'
import { PURPOSES, PURPOSE_COPY, nounFor, type Purpose } from '@/lib/sell/purpose'
import {
  MultiStepComposer,
  type StepDef,
} from '@/components/composer/MultiStepComposer'
import { AddEntityDrawer } from '@/components/composer/AddEntityDrawer'
import { PagePhotoPicker } from '@/components/media/PagePhotoPicker'
import { SocialLinksFields } from '@/components/group/SocialLinksFields'
import type { SocialLinks } from '@/lib/groups/social-links'
import {
  LocationPlaceFields,
  initialLocationPlaceFieldsState,
  isLocationPlaceFieldsComplete,
  type LocationPlaceFieldsState,
} from '@/components/locations/LocationPlaceFields'
import type { CreateLocationInput } from '@/app/_actions/location-actions'
import { isValidTagLabel, normalizeTag, TAG_MAX_LENGTH } from '@/lib/groups/tags'

export interface AnchorLocationOption {
  id: string
  label: string
  /** Optional secondary line (e.g., "Sacramento, CA"). */
  sublabel?: string
}

export interface SellWalkthroughState {
  /** F087 — what the person said they were making. Null until they answer,
   *  and null for a draft started before the question existed. Selects the
   *  words downstream and nothing else; see src/lib/sell/purpose.ts. */
  purpose: Purpose | null
  /** Set after the name step writes the draft. Steps 2+ patch it via group.update_draft. */
  draftGroupId: string | null
  brand: string
  anchorLocationId: string | null
  /** Local-only label for the picker UI; not persisted. */
  anchorLocationLabel: string | null
  /** T144 — deliberately NOT patched via group.update_draft. Deferred to
   *  the final activate() call (see onComplete) so changing your mind
   *  mid-draft never writes more than the one final choice — see T144
   *  Completion notes on the resume tradeoff this costs. */
  /** F070 · T145 — the Page's photo, as a URL in the media bucket. Null until
   *  one is chosen, and null again if it is removed — the two are different
   *  and `group.update_draft` writes both. The upload happens in the picker;
   *  by the time it reaches here the bytes are already stored. */
  photoUrl: string | null
  /** F070 — the Page's links out. Empty object means none. */
  socialLinks: SocialLinks
  /** T159 — the tags a creator has added, as typed. Normalization happens at
   *  the handler, not here, so what the creator sees is what they wrote. */
  tags: string[]
  /** What is in the input and not yet added. */
  tagDraft: string
  about: string
}

export interface SellWalkthroughHandlers {
  /** Called on step-1 Continue. Returns the new draft Group id. */
  createDraft: (input: { brand: string }) => Promise<{ groupId: string }>
  /** Called on steps 2–4 Continue with the diff for that step. */
  updateDraft: (input: {
    groupId: string
    anchorLocationId?: string
    about?: string
    /** F070 · T145 — null clears the photo; undefined leaves it alone. */
    photoUrl?: string | null
    /** F070 — the Page's links out. */
    socialLinks?: SocialLinks
    /** Brand re-edit from Back navigation. Not normally sent. */
    brand?: string
  }) => Promise<void>
  /** Called on the final step. Returns the place-scoped Group URL. */
  activate: (input: {
    groupId: string
    tags: string[]
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
    /** F070 · T145 — the photo already on the draft, if any. */
    photoUrl?: string | null
    /** F070 — links already on the draft, if any. */
    socialLinks?: SocialLinks | null
    /** 0-indexed step the composer should resume on. */
    resumeFromStep: number
  }
  onAbandon: () => void
  /** F070 · T145 — whose media folder an uploaded photo lands in. */
  memberId: string
}

const toastSuccess = (purpose: Purpose | null) => `Your ${nounFor(purpose)} is live.`

function emptyState(): SellWalkthroughState {
  return {
    purpose: null,
    draftGroupId: null,
    brand: '',
    anchorLocationId: null,
    anchorLocationLabel: null,
    photoUrl: null,
    socialLinks: {},
    tags: [],
    tagDraft: '',
    about: '',
  }
}

export function SellWalkthrough({
  resume,
  memberId,
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
        photoUrl: resume.photoUrl ?? null,
        socialLinks: resume.socialLinks ?? {},
        // T144 — category is never persisted during drafting (see the
        // field's own comment above), so a resumed session has no
        // server-side value to restore it from. The Member re-picks it.
        tags: [],
        tagDraft: '',
        about: resume.about,
            purpose: null,
      }
    : emptyState()

  // Step definitions — kept inline so the captures (handlers above) bind
  // cleanly. The composer is generic over S; we instantiate with our state.
  const steps: StepDef<SellWalkthroughState>[] = [
    // F087 — the question comes first. Don's words, 2026-09-15.
    // Nothing is pre-selected: F087 criterion 2, and the same reason the
    // metro step pre-selects nothing. A default here is an assumption about
    // what someone is making, which is the assumption this step removes.
    {
      id: 'purpose',
      title: 'What are we creating?',
      helper: 'Pick the one closest to what you have in mind.',
      render: (state, setState) => (
        <fieldset>
          <legend className="sr-only">What are we creating?</legend>
          <div className="flex flex-col gap-2">
            {PURPOSES.map((p) => (
              <label
                key={p}
                className={`flex min-h-11 cursor-pointer items-center rounded-md border px-4 text-sm ${
                  state.purpose === p
                    ? 'border-transparent bg-[var(--color-charcoal-700)] text-white'
                    : 'border-[var(--color-control-border)] bg-white text-[var(--color-charcoal-900)]'
                }`}
              >
                <input
                  type="radio"
                  name="sell-purpose"
                  className="sr-only"
                  data-testid={`sell-purpose-${p}`}
                  checked={state.purpose === p}
                  onChange={() => setState({ ...state, purpose: p })}
                />
                {PURPOSE_COPY[p].choice}
              </label>
            ))}
          </div>
        </fieldset>
      ),
      validate: (state) =>
        state.purpose
          ? { ok: true }
          : { ok: false, errors: { purpose: 'Pick one to carry on' } },
    },

    // 1. Name
    {
      id: 'brand',
      title: (state) => `Name your ${nounFor(state.purpose)}`,
      helper: (state) => `What should your ${nounFor(state.purpose)} be called?`,
      render: (state, setState) => (
        <label className="block">
          <span className="text-sm font-medium text-[var(--color-fg)]">Name</span>
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
          : { ok: false, errors: { brand: 'A name is required' } },
    },

    // 2. Anchor Location
    {
      id: 'anchor',
      title: 'Anchor Location',
      helper: (state) => `Where is your ${nounFor(state.purpose)} primarily based?`,
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

    // 3. Tags (T159) — same position the category step held.
    {
      id: 'tags',
      title: 'What you do',
      helper: 'Add a few words people would search for. Your words, not ours.',
      render: (state, setState) => <TagStep state={state} setState={setState} />,
      validate: (state) => {
        // An untagged Page cannot be found by what it does, which is the one
        // outcome the tags-only ruling exists to prevent. Anything still in
        // the input counts — a creator who typed a word and moved on has not
        // changed their mind about it.
        const usable = [...state.tags, state.tagDraft].filter(isValidTagLabel)
        return usable.length > 0
          ? { ok: true }
          : { ok: false, errors: { tags: 'Add at least one word that describes what you do' } }
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
          <div className="mt-4">
            <PagePhotoPicker
              memberId={memberId}
              value={state.photoUrl}
              onChange={(url: string | null) => setState({ ...state, photoUrl: url })}
            />
          </div>
          {/* Every Page this composer creates is kind='business' — the purpose
              step confers no kind (F087 criterion 6) and resolveShop filters on
              it. Stated rather than hardcoded downstream: the control asks
              kind-controls, so a composer that one day creates other kinds gets
              the right answer without this line changing meaning. */}
          <SocialLinksFields
            kind="business"
            value={state.socialLinks}
            onChange={(next) => setState({ ...state, socialLinks: next })}
          />
        </label>
      ),
      validate: () => ({ ok: true }),
    },

    // 5. Locality claim (Tier 0) — UI-only at b1 (no substrate).

    // 6. Review & done
    {
      id: 'review',
      title: 'Review',
      helper: (state) => `Confirm the details below, then create your ${nounFor(state.purpose)}.`,
      finalLabel: (state) => `Create my ${nounFor(state.purpose)}`,
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
            <strong>Links:</strong>{' '}
            {Object.keys(state.socialLinks).length > 0 ? (
              `${Object.keys(state.socialLinks).length} added`
            ) : (
              <em className="text-[var(--color-fg-muted)]">(none)</em>
            )}
          </li>
          <li>
            <strong>Photo:</strong>{' '}
            {state.photoUrl ? (
              'added'
            ) : (
              <em className="text-[var(--color-fg-muted)]">(none)</em>
            )}
          </li>
          <li>
            <strong>About:</strong>{' '}
            {state.about ? (
              state.about
            ) : (
              <em className="text-[var(--color-fg-muted)]">(none)</em>
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
      // F087 — the question writes nothing. It has to return before the
      // draft-id guard below, which runs for every step after `brand` and
      // throws when there is no draft yet. This step comes BEFORE the draft
      // exists, so falling through it is how the flow silently refused to
      // advance the first time.
      if (stepId === 'purpose') return

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
      if (stepId === 'tags') {
        // T159 — deliberately not patched via group.update_draft. Held in
        // composer state only and sent with the final activate() call, so a
        // creator changing their mind mid-draft never leaves abandoned tags
        // in the shared vocabulary.
        return
      }
      if (stepId === 'about') {
        await updateDraft({
          groupId: draftGroupId,
          about: state.about,
          // Always sent, never conditional on truthiness: null is how a
          // removed photo reaches the handler, and `undefined` would mean
          // "leave it alone" — which would make removal impossible.
          photoUrl: state.photoUrl,
          socialLinks: state.socialLinks,
        })
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
      const tags = [...state.tags, state.tagDraft].filter(isValidTagLabel)
      const { destinationUrl } = await activate({ groupId: draftGroupId, tags })
      // Composer is presentational — it does not navigate. We do.
      redirect(destinationUrl)
      showToast(toastSuccess(state.purpose))
      return { destinationUrl }
    },
    [activate, redirect, showToast, shadowDraftId],
  )

  return (
    <MultiStepComposer<SellWalkthroughState>
      finalNotice={<PostingSafetyNote />}
      steps={steps}
      initialState={initialState}
      resumeFromStep={resume?.resumeFromStep ?? 0}
      onAdvance={onAdvance}
      onComplete={onComplete}
      onAbandon={onAbandon}
      // T073b: dialog accessible name must NOT match any step input's label
      // (e.g. "Name") or Playwright's getByLabel resolves to both. F087 makes
      // that tighter, since the step headings now carry the chosen noun — so
      // this takes voice.md's own button vocabulary, which collides with none
      // of them and never says Page.
      dialogLabel="Create something"
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

/** Step-3 tag input (T159). Replaces the twelve-term category picker.
 *
 *  A plain text input rather than a picker over a fixed list, because
 *  creators create their own tags — the vocabulary starts empty and fills
 *  itself. Suggestions from existing tags are a progressive enhancement and
 *  deliberately not a precondition: gating this step on a seeded list is
 *  exactly what the tags-only ruling removed.
 *
 *  Enter and comma both commit a tag. Comma because people type lists that
 *  way unprompted, and a creator typing "bread, pastry" and getting one tag
 *  called "bread, pastry" is a silent wrong answer. */
/** Examples, not defaults — nothing is prefilled and nothing is submitted. */
const TAG_PLACEHOLDER = 'sourdough, honey, eggs, soap'

function TagStep({
  state,
  setState,
}: {
  state: SellWalkthroughState
  setState: (next: SellWalkthroughState) => void
}) {
  // Greyed examples rather than help text explaining what a tag is. A
  // creator knows what they offer — most already market on other apps, so
  // the register is the prompt, not an explanation. Farmers market
  // vocabulary because that is the seed audience.
  const add = (raw: string) => {
    const label = raw.trim()
    if (!isValidTagLabel(label)) return
    // Compare normalized so "Bread" after "bread" is not a second chip; keep
    // what was typed first, because that is what the creator already sees.
    const already = state.tags.some((t) => normalizeTag(t) === normalizeTag(label))
    setState({
      ...state,
      tags: already ? state.tags : [...state.tags, label],
      tagDraft: '',
    })
  }

  const remove = (label: string) =>
    setState({ ...state, tags: state.tags.filter((t) => t !== label) })

  return (
    <div>
      <label htmlFor="sell-tag-input" className="text-sm font-medium text-[var(--color-fg)]">
        What you do
      </label>

      {state.tags.length > 0 && (
        <ul data-testid="sell-tag-list" className="mt-2 flex flex-wrap gap-2">
          {state.tags.map((tag) => (
            <li key={tag}>
              <span className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1 text-sm">
                {tag}
                <button
                  type="button"
                  data-testid={`sell-tag-remove-${tag}`}
                  aria-label={`Remove ${tag}`}
                  onClick={() => remove(tag)}
                  className="ml-1 min-h-tap text-neutral-500 hover:text-neutral-900"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <input
        id="sell-tag-input"
        type="text"
        data-testid="sell-tag-input"
        value={state.tagDraft}
        maxLength={TAG_MAX_LENGTH}
        placeholder={TAG_PLACEHOLDER}
        onChange={(e) => {
          const v = e.target.value
          if (v.endsWith(',')) add(v.slice(0, -1))
          else setState({ ...state, tagDraft: v })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Commits a tag; must not submit the step.
            e.preventDefault()
            add(state.tagDraft)
          }
        }}
        className="input mt-2 min-h-tap w-full"
      />

      <button
        type="button"
        data-testid="sell-tag-add"
        onClick={() => add(state.tagDraft)}
        disabled={!isValidTagLabel(state.tagDraft)}
        className="mt-2 min-h-tap text-sm font-medium text-[var(--color-accent)] disabled:opacity-40"
      >
        Add
      </button>

    </div>
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
