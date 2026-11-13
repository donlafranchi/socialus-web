'use client'

// #1299 — one screen of the waitlist journey: Back, the fast-then-slow bar, the imagery slot, the one question,
// and the main button pinned in thumb reach. Words: src/lib/waitlist/journey.ts (placeholder for the copywriter).

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { checkWaitlistZipAction, joinWaitlistJourneyAction } from '@/app/_actions/waitlist-journey-actions'
import {
  doneLines, EMAIL_SHAPE, ERRORS, filled, href, KINDS, LANDING, neighbours, OPTIONAL, pathFor, phoneE164, PLANS, SAFETY,
  SCREENS, SEGMENTS, sideOf, ZIP_SHAPE, type Step,
} from '@/lib/waitlist/journey'
import { useWaitlist } from './WaitlistProvider'

const FIELD = 'mt-6 block min-h-12 w-full rounded-xs border border-[var(--color-ink-muted)] bg-white px-4 text-lede text-[var(--color-ink)]'
const BUTTON = 'press inline-flex min-h-12 w-full items-center justify-center rounded-xs px-6 text-body font-semibold'
const PRIMARY = `${BUTTON} bg-[var(--color-clay)] text-[var(--color-paper)] disabled:opacity-60`
const QUIET = `${BUTTON} text-[var(--color-ink-muted)] underline underline-offset-4`

export function ImageSlot({ note }: { note: string }) {
  return (
    <div data-image-slot={note} className="flex aspect-[2/1] w-full items-center justify-center rounded-xs border border-dashed border-[var(--color-rule)] bg-[var(--color-paper)] p-4 text-center text-body-sm text-[var(--color-ink-muted)]">
      Image: {note}
    </div>
  )
}

function Chip({ on, label, toggle }: { on: boolean; label: string; toggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={toggle}
      className={`press min-h-12 rounded-full border px-4 text-left text-body ${on ? 'border-[var(--color-clay)] bg-[var(--color-clay)] text-[var(--color-paper)]' : 'border-[var(--color-ink-muted)] bg-white text-[var(--color-ink)]'}`}
    >
      {label}
    </button>
  )
}

const toggled = (list: readonly string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export function JourneyScreen({ step }: { step: Step }) {
  const router = useRouter()
  const { answers: a, set, ready } = useWaitlist()
  const sent = useSearchParams().get('e')
  const [error, setError] = useState<string | null>(sent && sent in ERRORS ? ERRORS[sent as keyof typeof ERRORS] : null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [step])
  // A screen not on this person's path (a being-found screen opened directly) goes back to the plans.
  const offPath = ready && step !== 'done' && !pathFor(a.plans).includes(step)
  useEffect(() => {
    if (offPath) router.replace(href('plans'))
  }, [offPath, router])
  const [why, setWhy] = useState(false)
  const [pending, start] = useTransition()
  const screen = SCREENS[step]
  const { back, next } = neighbours(step, a.plans)
  const go = (to: string | null) => to && router.push(to)

  const advance = (e?: FormEvent) => {
    e?.preventDefault()
    setError(null)
    if (step === 'plans' && !a.plans.length) return setError(ERRORS.plans)
    if (step === 'name' && !a.name.trim()) return setError(ERRORS.name)
    if (step === 'email' && !EMAIL_SHAPE.test(a.email.trim())) return setError(ERRORS.email)
    if (step === 'zip') {
      if (!ZIP_SHAPE.test(a.zip)) return setError(ERRORS.zip)
      return start(async () => {
        const r = await checkWaitlistZipAction(a.zip)
        if (!r.ok) return setError(ERRORS.zip)
        set({ market: r.market })
        go(next)
      })
    }
    if (step === 'phone') {
      if (!phoneE164(a.phone)) return setError(ERRORS.phone)
      const found = sideOf(a.plans) === 'creator'
      return start(async () => {
        const r = await joinWaitlistJourneyAction({
          plans: a.plans, kinds: found ? a.kinds : [], offerName: found ? a.offerName : '', offerLink: found ? a.offerLink : '',
          name: a.name.trim(), zip: a.zip, email: a.email.trim(), phone: a.phone,
        }).catch(() => null)
        if (!r) return setError(ERRORS.failed)
        if (!r.ok) {
          if (r.step && r.step !== 'phone') return router.push(`${href(r.step)}?e=${r.step}`)
          return setError(r.step ? ERRORS[r.step] : ERRORS.failed)
        }
        set({ market: r.market, waiting: r.waiting, joined: true })
        go(next)
      })
    }
    go(next)
  }

  let body: ReactNode = null
  if (step === 'plans') {
    body = (
      <>
        {[PLANS.discover, PLANS.found].map((group, i) => (
          <fieldset key={i} className="mt-6">
            <legend className="text-body-sm font-semibold text-[var(--color-ink-muted)]">{i ? 'Be found' : 'Discover'}</legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {group.map((p) => (
                <Chip key={p.id} label={p.label} on={a.plans.includes(p.id)} toggle={() => set({ plans: toggled(a.plans, p.id) })} />
              ))}
            </div>
          </fieldset>
        ))}
      </>
    )
  } else if (step === 'kind') {
    body = (
      <div className="mt-6 flex flex-wrap gap-3">
        {KINDS.map((k) => (
          <Chip key={k} label={k} on={a.kinds.includes(k)} toggle={() => set({ kinds: toggled(a.kinds, k) })} />
        ))}
      </div>
    )
  } else if (step === 'called') {
    body = (
      <>
        <label className="mt-6 block text-body-sm font-semibold">
          Business or group name
          <input className={FIELD} value={a.offerName} maxLength={120} autoComplete="organization" onChange={(e) => set({ offerName: e.target.value })} />
        </label>
        <label className="mt-4 block text-body-sm font-semibold">
          Website or social link
          <input className={FIELD} value={a.offerLink} maxLength={300} type="url" inputMode="url" autoComplete="url" onChange={(e) => set({ offerLink: e.target.value })} />
        </label>
      </>
    )
  } else if (step === 'name') {
    body = <input aria-label="Your name" aria-invalid={!!error} aria-describedby={error ? 'journey-error' : undefined} className={FIELD} value={a.name} maxLength={60} autoComplete="given-name" onChange={(e) => set({ name: e.target.value })} />
  } else if (step === 'zip') {
    body = <input aria-label="Zip code" aria-invalid={!!error} aria-describedby={error ? 'journey-error' : undefined} className={FIELD} value={a.zip} inputMode="numeric" autoComplete="postal-code" maxLength={5} pattern="[0-9]*" onChange={(e) => set({ zip: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
  } else if (step === 'email') {
    body = <input aria-label="Email" aria-invalid={!!error} aria-describedby={error ? 'journey-error' : undefined} className={FIELD} value={a.email} type="email" autoComplete="email" maxLength={254} onChange={(e) => set({ email: e.target.value })} />
  } else if (step === 'phone') {
    body = (
      <>
        <input aria-label="Mobile number" aria-invalid={!!error} aria-describedby={error ? 'journey-error' : undefined} className={FIELD} value={a.phone} type="tel" autoComplete="tel" maxLength={20} onChange={(e) => set({ phone: e.target.value })} />
        <p className="mt-6 text-body text-[var(--color-ink)]">
          {SAFETY.line}{' '}
          <button type="button" aria-expanded={why} aria-label="More about this" onClick={() => setWhy(!why)} className="inline-flex min-h-12 min-w-12 items-center justify-center align-middle text-title-1">
            ⓘ
          </button>
        </p>
        {why && <p className="text-body-sm text-[var(--color-ink-muted)]">{SAFETY.more}</p>}
      </>
    )
  } else if (step === 'done') {
    body =
      ready && a.joined && a.market ? (
        doneLines(a.market, a.waiting).map((l) => (
          <p key={l} className="mt-4 text-lede text-[var(--color-ink)]">
            {l}
          </p>
        ))
      ) : ready ? (
        <p className="mt-4 text-lede">
          <Link href={href('start')} className="underline underline-offset-4">
            Start from the beginning
          </Link>
        </p>
      ) : null
  }

  const optional = OPTIONAL.includes(step)
  return (
    <form onSubmit={advance} noValidate className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-read items-center gap-3 px-4 pt-3">
        <Link href={back} className="inline-flex min-h-12 min-w-12 items-center text-body font-semibold text-[var(--color-ink)]" aria-label="Back">
          ← Back
        </Link>
        <div role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={SEGMENTS} aria-valuenow={step === 'done' ? SEGMENTS : filled(step, a.plans)} className="flex flex-1 gap-1">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < (step === 'done' ? SEGMENTS : filled(step, a.plans)) ? 'bg-[var(--color-clay)]' : 'bg-[var(--color-rule)]'}`} />
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-read flex-1 px-4 pb-40 pt-6">
        <ImageSlot note={screen.image} />
        <h1 ref={heading} tabIndex={-1} className="mt-6 text-title-1 outline-none font-normal tracking-tight text-[var(--color-ink)]">{screen.title}</h1>
        {screen.body && <p className="mt-3 text-lede text-[var(--color-ink-muted)]">{screen.body}</p>}
        {body}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-[var(--color-rule)] bg-[var(--color-paper)] px-4 pb-[calc(--spacing(3)+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-read flex-col gap-2">
            {error && (
              <p id="journey-error" role="alert" className="text-body font-semibold text-[var(--color-danger,#b42318)]">
                {error}
              </p>
            )}
          {step === 'done' ? (
            <Link href={LANDING.lookHref} className={PRIMARY}>
              {LANDING.look}
            </Link>
          ) : (
            <button type="submit" disabled={pending} className={PRIMARY}>
              {screen.cta ?? 'Next'}
            </button>
          )}
          {optional && (
            <button type="button" onClick={() => go(next)} className={QUIET}>
              Skip
            </button>
          )}
        </div>
      </footer>
    </form>
  )
}
