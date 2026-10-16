'use client'

// T097 — Owner-only "Locally Owned claim" management widget (F037 surface).
// Spec: planning/now/scenario-F037-maya-claims-locally-owned.md beats 1–6.
//
// Renders below the Shop header for owner-role viewers only (the page resolves
// `ownerClaim` via resolveOwnerClaim and renders this only when non-null). The
// server actions are passed as props (server-component → client-component) so
// the widget stays pure + unit-testable.
//
// States off `claim`:
//   - empty       (zip === null)          → "Add ZIP"
//   - claimed     (zip set)               → "Claimed local owner — ZIP on file" (#874: any ZIP; no distance test)
// Add and Edit both call onSet (the handler soft-replaces — T075 deviation #4).

import { useState } from 'react'
import { useLocalOwnerClaim, type LocalOwnerClaimState } from './LocalOwnerClaimState'

interface Props {
  groupId: string
  // #806 — each save returns the claim and badge as they now stand.
  onSet: (input: { groupId: string; zip: string }) => Promise<LocalOwnerClaimState>
  onRemove: (input: { groupId: string }) => Promise<LocalOwnerClaimState>
}

type Mode = 'view' | 'editing' | 'removing'

const ZIP_RE = /^[0-9]{5}$/

export function LocallyOwnedClaim({ groupId, onSet, onRemove }: Props) {
  const { state, set } = useLocalOwnerClaim()
  const { claim } = state
  const [mode, setMode] = useState<Mode>('view')
  const [zip, setZip] = useState(claim.zip ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function startEdit() {
    setZip(claim.zip ?? '')
    setError(null)
    setMode('editing')
  }

  async function submit() {
    if (!ZIP_RE.test(zip)) {
      setError('Enter a 5-digit US ZIP code.')
      return
    }
    setError(null)
    setPending(true)
    try {
      set(await onSet({ groupId, zip }))
      setMode('view')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your ZIP.')
    } finally {
      setPending(false)
    }
  }

  async function confirmRemove() {
    setPending(true)
    try {
      set(await onRemove({ groupId }))
      setMode('view')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your claim.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section
      data-testid="claim-widget"
      aria-labelledby="claim-heading"
      // #806 — busy while a save is in flight; the save itself brings the new claim.
      aria-busy={pending}
      className="mt-6 rounded border border-gray-200 p-4"
    >
      <h2 id="claim-heading" className="text-sm font-medium text-gray-700">
        Locally Owned claim
      </h2>

      {mode === 'editing' ? (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor="claim-zip" className="text-sm text-gray-600">
            Your business ZIP
          </label>
          <input
            id="claim-zip"
            data-testid="claim-zip-input"
            inputMode="numeric"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            aria-describedby={error ? 'claim-zip-error' : undefined}
            aria-invalid={error ? true : undefined}
            className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          {error && (
            <p id="claim-zip-error" data-testid="claim-zip-error" role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="claim-submit"
              className="btn-primary"
              disabled={pending}
              onClick={submit}
            >
              Save
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() => {
                setError(null)
                setMode('view')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : mode === 'removing' ? (
        <div className="mt-3 flex flex-col gap-2">
          <p role="status" className="text-sm text-gray-600">
            Remove your Locally Owned claim? The badge will stop showing.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="claim-remove-confirm"
              className="btn-primary"
              disabled={pending}
              onClick={confirmRemove}
            >
              Remove claim
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() => setMode('view')}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : claim.zip === null ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-sm text-gray-600">
            You haven&apos;t claimed Locally Owned yet — add your ZIP to display the badge.
          </p>
          <button
            type="button"
            data-testid="claim-add"
            className="btn-primary self-start"
            onClick={startEdit}
          >
            Add ZIP
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-sm text-gray-700">
            <span className="font-medium">Claimed local owner</span> — ZIP on file: {claim.zip}.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="claim-edit"
              className="btn-secondary"
              onClick={startEdit}
            >
              Edit
            </button>
            <button
              type="button"
              data-testid="claim-remove"
              className="btn-secondary"
              onClick={() => {
                setError(null)
                setMode('removing')
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
