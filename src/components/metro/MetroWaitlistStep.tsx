'use client'

// T163 (#77) — "say where you are, and whether you're here to make things or
// find them", plus the popup that follows.
//
// Kept to a native <select> and two native radios on purpose. 296 metros in a
// select is typeahead-searchable for free, keyboard-operable for free, and
// announced correctly for free; a hand-rolled combobox would be a new pattern
// and a new set of bugs for no gain. The ticket's constraint is "keep it
// simple", and this is what simple looks like at this size.
//
// NOTHING IS PRE-SELECTED. The metro starts on a placeholder that is not a
// metro, and neither role is checked. Criterion 2 forbids choosing for them by
// IP, by a default, or by nearest-match — and a pre-checked radio is choosing
// for them just as much as geolocation would be.

import { useId, useState } from 'react'
import type { JoinMetroWaitlistResult } from '@/app/_actions/metro-waitlist-actions'
import { MetroStandingDialog } from './MetroStandingDialog'

export interface MetroOption {
  id: string
  name: string
}

type Role = 'creator' | 'patron'

interface Props {
  metros: MetroOption[]
  onJoin: (input: { metroId: string; role: Role }) => Promise<JoinMetroWaitlistResult>
  /** Called once the person is finished — dismissed the popup, or had none. */
  onDone: () => void
}

export function MetroWaitlistStep({ metros, onJoin, onDone }: Props) {
  const [metroId, setMetroId] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [standing, setStanding] = useState<JoinMetroWaitlistResult | null>(null)

  const selectId = useId()
  const roleName = useId()

  const submit = async () => {
    if (!metroId || !role || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await onJoin({ metroId, role })
      // An open metro has nothing to wait for, so there is nothing to show.
      if (result.open) {
        onDone()
        return
      }
      setStanding(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor={selectId} className="block text-sm font-medium text-[var(--color-charcoal-900)]">
            Where are you?
          </label>
          <select
            id={selectId}
            value={metroId}
            onChange={(e) => setMetroId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--color-control-border)] bg-white p-3 text-sm text-[var(--color-charcoal-900)]"
          >
            {/* Not a metro, and not selectable as one. */}
            <option value="">Pick your metro</option>
            {metros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-[var(--color-charcoal-900)]">
            What brings you here?
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            <RoleChoice
              name={roleName}
              label="I make things"
              checked={role === 'creator'}
              onChange={() => setRole('creator')}
            />
            <RoleChoice
              name={roleName}
              label="I'm here to find things"
              checked={role === 'patron'}
              onChange={() => setRole('patron')}
            />
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-[var(--color-charcoal-900)]">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full rounded-full bg-[var(--color-charcoal-700)] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Just a moment…' : 'Continue'}
        </button>
      </div>

      {standing && (
        <MetroStandingDialog
          metroName={standing.metroName}
          combined={standing.standing.combined}
          target={standing.standing.target}
          message={standing.message}
          onClose={() => {
            setStanding(null)
            onDone()
          }}
        />
      )}
    </>
  )
}

function RoleChoice({
  name,
  label,
  checked,
  onChange,
}: {
  name: string
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm ${
        checked
          ? 'border-transparent bg-[var(--color-charcoal-700)] text-white'
          : 'border-[var(--color-control-border)] bg-white text-[var(--color-charcoal-900)]'
      }`}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}
