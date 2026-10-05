'use client'

// #298 — every shared component in its states, in one place. Dev only: the
// (dev) layout's gate returns not-found in production. The screenshot matrix
// captures it at every width, so a component change shows up here first.

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { Toast } from '@/components/Toast'
import { FollowPageButton } from '@/components/group/FollowPageButton'
import { AreaPicker } from '@/components/explore/AreaPicker'
import type { FeedMetro } from '@/lib/feed/feed-metro'

const METROS: FeedMetro[] = [
  { id: 'm1', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true },
  { id: 'm2', slug: 'portland-vancouver-or-wa', name: 'Portland-Vancouver, OR-WA', isOpen: false },
]
const ok = async () => ({ ok: true as const, relationship: 'follower' as const })

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--color-border)] py-6">
      <h2 className="text-title-2 text-[var(--color-fg)]">{title}</h2>
      <div className="mt-4 flex flex-wrap items-start gap-4">{children}</div>
    </section>
  )
}

export function Playground() {
  const [sheet, setSheet] = useState(false)
  const [toast, setToast] = useState(false)
  const [area, setArea] = useState(false)

  return (
    <main className="mx-auto w-full max-w-detail gutter py-8 pb-nav">
      <h1 className="text-title-1 md:text-title-1-lg text-[var(--color-fg)]">Playground</h1>
      <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]">Dev only. Every shared component, in its states.</p>

      <Section title="Buttons">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="quiet">Quiet</Button>
        <Button variant="danger">Danger (confirm only)</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
      </Section>

      <Section title="Follow button">
        <FollowPageButton groupId="g" isPrivate={false} loggedIn following={false} onFollow={ok} onUnfollow={ok} />
        <FollowPageButton groupId="g" isPrivate={false} loggedIn following onFollow={ok} onUnfollow={ok} />
        <FollowPageButton groupId="g" isPrivate loggedIn following={false} onFollow={ok} onUnfollow={ok} />
        <FollowPageButton groupId="g" isPrivate loggedIn following onFollow={ok} onUnfollow={ok} />
        <FollowPageButton groupId="g" isPrivate={false} loggedIn={false} following={false} onFollow={ok} onUnfollow={ok} />
      </Section>

      <Section title="Form fields">
        <div className="w-full max-w-form space-y-4">
          <Field label="Page name" hint="Shown on your Page and in Explore.">
            {(p) => <input {...p} className="input" defaultValue="Riverside Morning Runners" />}
          </Field>
          <Field label="Email" error="Enter an email like name@example.com">
            {(p) => <input {...p} className="input" defaultValue="maya@" />}
          </Field>
        </div>
      </Section>

      <Section title="Sheet">
        <Button variant="secondary" onClick={() => setSheet(true)}>
          Open sheet
        </Button>
        <Sheet
          open={sheet}
          title="A sheet"
          onClose={() => setSheet(false)}
          footer={<Button className="w-full" onClick={() => setSheet(false)}>Done</Button>}
        >
          <p className="text-body-sm">A bottom sheet on a phone, a centred dialog from 744.</p>
        </Sheet>
      </Section>

      <Section title="Toast">
        <Button variant="secondary" onClick={() => setToast(true)}>
          Show toast
        </Button>
        <Toast
          message="Maya is in."
          visible={toast}
          onHide={() => setToast(false)}
          action={{ label: 'Undo', onClick: () => {} }}
        />
      </Section>

      <Section title="Area picker">
        <Button variant="secondary" onClick={() => setArea(true)}>
          Choose your area
        </Button>
        <AreaPicker
          open={area}
          currentSlug="sacramento-roseville-ca"
          metros={METROS}
          onClose={() => setArea(false)}
          onChoose={() => setArea(false)}
        />
      </Section>
    </main>
  )
}
