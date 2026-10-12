// #640 (F100.11, the PM's call C) — "AI readiness", for staff: the harness numbers against the ruled targets,
// the days of shadow reads, and one light. For beta the live flip is Don's own checklist with these numbers
// shown to him; software refusing the flip is the production step.

import type { Readiness, Reading, Status } from '@/lib/moderation/readiness'
import { AiKeyCheck } from './AiKeyCheck'
import { checkAiKeyAction } from './key-check-action'

const WORD: Record<Status, string> = { green: 'Met', amber: 'Close', red: 'Not met' }
const DOT: Record<Status, string> = { green: 'bg-green-600', amber: 'bg-amber-500', red: 'bg-red-600' }
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`.replace(/\.0%$/, '%')

function Light({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[status]}`} />
      {WORD[status]}
    </span>
  )
}

function Row({ id, label, target, r }: { id: string; label: string; target: string; r: Reading }) {
  return (
    <li data-testid={`ai-readiness-${id}`} className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-sm text-[var(--color-fg)]">{label}</span>
        <Light status={r.status} />
      </div>
      <p className="text-caption text-[var(--color-fg-muted)]">
        {r.value === null ? 'No run yet' : pct(r.value)} · target {target}
        {r.runAt ? ` · run ${r.runAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
      </p>
      {r.note && <p className="text-caption text-[var(--color-fg-muted)]">{r.note}</p>}
    </li>
  )
}

export function AiReadiness({ readiness: r }: { readiness: Readiness }) {
  return (
    <section data-testid="ai-readiness" aria-labelledby="ai-readiness-title" className="mb-4 rounded-lg border border-[var(--color-border)] p-4">
      <h2 id="ai-readiness-title" className="text-title-3 text-[var(--color-fg)]">
        AI readiness
      </h2>
      <p data-testid="ai-readiness-overall" className="mt-1 flex items-center gap-2 text-body-sm font-medium text-[var(--color-fg)]">
        <span aria-hidden="true" className={`inline-block h-3 w-3 rounded-full ${r.ready ? DOT.green : DOT.red}`} />
        {r.ready ? 'Ready to go live' : 'Not ready to go live yet'}
      </p>
      <ul className="mt-2 divide-y divide-[var(--color-border)]">
        <Row id="recall" label="Catches what it should" target="95% or more" r={r.recall} />
        <Row id="sev1" label="Catches the most serious" target="100%" r={r.sev1Recall} />
        <Row id="false-alarms" label="Flags something fine" target="under 10%" r={r.falseAlarms} />
        <li data-testid="ai-readiness-shadow" className="py-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-body-sm text-[var(--color-fg)]">Shadow reads</span>
            <Light status={r.shadow.status} />
          </div>
          <p className="text-caption text-[var(--color-fg-muted)]">
            {r.shadow.days} of {r.shadow.of} days
          </p>
        </li>
      </ul>
      <AiKeyCheck check={checkAiKeyAction} />
      <p className="mt-2 text-caption text-[var(--color-fg-muted)]">
        The switch to live is yours to flip. Nothing stops the switch yet; these are the numbers to check first.
      </p>
    </section>
  )
}
