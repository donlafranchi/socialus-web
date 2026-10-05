'use client'

// #369 — the owner's tools (socialus-design owner-page-spec; dispatch,
// 2026-10-05). The Page comes first, as people see it; then four groups: Tell
// people, People, Add to your Page, Settings. Under 1280 they're a bar with a
// sheet per group; from 1280, a panel beside the Page. Never a separate manage
// view. Precedent: Google Business Profile's owner panel in Search, Facebook's
// Professional dashboard.
//
// SERVER-SIDE, NOT A HIDDEN BUTTON. Rendered only when the server resolved
// `viewerOwnsPage`; every write behind it re-checks the managing role.

import { useState, type ReactNode } from 'react'
import { Megaphone, Users, Plus, Settings } from 'lucide-react'
import { usePageEditor, type Section } from './edit/PageEditor'
import { Sheet } from '@/components/ui/Sheet'
import { Button, buttonClass } from '@/components/ui/Button'
import { ANNOUNCE_ANCHOR } from './announce-anchor'

type Group = 'tell' | 'people' | 'add' | 'settings'
const GROUP_TITLE: Record<Group, string> = { tell: 'Tell people', people: 'People', add: 'Add to your Page', settings: 'Settings' }

interface Props {
  pagePath: string
  followerCount?: number
}

function focusComposer() {
  requestAnimationFrame(() => document.getElementById('page-post-body')?.focus())
}

function NewPost({ pagePath, className = '' }: { pagePath: string; className?: string }) {
  // Secondary: the composer's own Post is the screen's one primary.
  return (
    <a href={`${pagePath}#${ANNOUNCE_ANCHOR}`} data-testid="owner-announce" onClick={focusComposer} className={`${buttonClass('secondary')} ${className}`}>
      <Megaphone size={16} aria-hidden="true" />
      New post
    </a>
  )
}

function GroupBody({ group, pagePath, followerCount = 0, done }: Props & { group: Group; done?: () => void }) {
  const editor = usePageEditor()
  const open = (s: Section) => {
    done?.()
    editor?.open(s)
  }
  if (group === 'tell')
    return (
      <>
        <p className="text-caption text-[var(--color-fg-muted)]">Choose Anyone, or only people following. You pick each time.</p>
        <NewPost pagePath={pagePath} />
      </>
    )
  if (group === 'people')
    return (
      <>
        <p className="text-body-sm text-[var(--color-fg)]">{followerCount > 0 ? `${followerCount} following your Page` : 'Nobody follows your Page yet'}</p>
        <p className="text-caption text-[var(--color-fg-muted)]">Only you see this.</p>
      </>
    )
  if (group === 'add')
    return (
      <>
        <p className="text-caption text-[var(--color-fg-muted)]">Turn on what helps. You can change it any time.</p>
        <Button variant="secondary" onClick={() => open('components')}>What your Page shows</Button>
      </>
    )
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          done?.()
          editor?.setEditing(true)
        }}
      >
        Edit your Page
      </Button>
      <Button variant="secondary" onClick={() => open('kind')}>Type of Page</Button>
      <Button variant="secondary" onClick={() => open('badges')}>Badges</Button>
    </>
  )
}

export function OwnerPanel(props: Props) {
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h2 className="text-title-3 text-[var(--color-fg)]">This is your Page.</h2>
        <p className="mt-1 text-caption text-[var(--color-fg-muted)]">Everything outside this panel is what people see.</p>
      </div>
      {(Object.keys(GROUP_TITLE) as Group[]).map((g) => (
        <section key={g} className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-4">
          <h3 className="text-body-sm font-semibold text-[var(--color-fg)]">{GROUP_TITLE[g]}</h3>
          <GroupBody group={g} {...props} />
        </section>
      ))}
      <EditingDone />
    </div>
  )
}

/** In edit mode the panel and the bar offer only the way out. */
function EditingDone({ className = '' }: { className?: string }) {
  const editor = usePageEditor()
  if (!editor?.editing) return null
  return (
    <Button onClick={() => editor.setEditing(false)} className={className}>
      Done
    </Button>
  )
}

const BAR: { group: Exclude<Group, 'tell'>; label: string; icon: ReactNode }[] = [
  { group: 'people', label: 'People', icon: <Users size={18} aria-hidden="true" /> },
  { group: 'add', label: 'Add', icon: <Plus size={18} aria-hidden="true" /> },
  { group: 'settings', label: 'Settings', icon: <Settings size={18} aria-hidden="true" /> },
]

export function OwnerBar(props: Props) {
  const editor = usePageEditor()
  const [sheet, setSheet] = useState<Group | null>(null)
  return (
    <div
      role="toolbar"
      aria-label="Your Page, only you see this"
      data-testid="owner-bar"
      className="fixed inset-x-0 bottom-[var(--nav-clearance)] z-[var(--z-float)] border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 md:bottom-0"
    >
      {editor?.editing ? (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-caption text-[var(--color-fg-muted)]">Tap Edit beside anything to change it.</p>
          <EditingDone />
        </div>
      ) : (
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2">
          <NewPost pagePath={props.pagePath} className="px-2" />
          {BAR.map((b) => (
            <button
              key={b.group}
              type="button"
              onClick={() => setSheet(b.group)}
              className="press flex min-h-tap flex-col items-center justify-center gap-0.5 rounded-md text-caption font-medium text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
            >
              {b.icon}
              {b.label}
            </button>
          ))}
        </div>
      )}
      {sheet && (
        <Sheet open title={sheet === 'add' ? 'Add to your Page' : GROUP_TITLE[sheet]} onClose={() => setSheet(null)} testId={`owner-sheet-${sheet}`}>
          <div className="flex flex-col gap-3">
            <GroupBody group={sheet} {...props} done={() => setSheet(null)} />
          </div>
        </Sheet>
      )}
    </div>
  )
}
