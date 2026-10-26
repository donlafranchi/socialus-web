// F069 criterion 4 — draft-resume keeps every in-flight draft, not just the most recent.
// The real getOwnPages and the real OwnPages, over a client that holds three drafts.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const { fake } = vi.hoisted(() => ({ fake: { current: null as unknown } }))
vi.mock('@/lib/supabase', () => ({ createClient: () => fake.current }))
vi.mock('@/app/_actions/page-lifecycle-actions', () => ({ restorePageAction: vi.fn(), discardDraftAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { OwnPages } from './OwnPages'

const row = (id: string, name: string) => ({
  id, name, slug: id, public_id: `${id}pub`, kind: 'business', category: null, description: null,
  photo_url: null, photo_hidden_at: null, lifecycle_state: 'draft', anchor: null,
})

function client(rows: { id: string }[]) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'or', 'order']) q[m] = vi.fn(() => q)
  q.limit = vi.fn(async () => ({ data: rows, error: null }))
  const ids = rows.map((r) => r.id)
  return { from: vi.fn(() => q), rpc: vi.fn(async () => ({ data: ids, error: null })) }
}

afterEach(cleanup)

describe('F069 criterion 4 — every in-flight draft', () => {
  // [guards F069.4]
  it('a member with three drafts sees all three under Unfinished Pages, each with Continue and Delete', async () => {
    fake.current = client([row('d1', 'First Bakery'), row('d2', 'Second Bakery'), row('d3', 'Third Bakery')])
    render(<OwnPages memberId="m1" onRestore={vi.fn()} onDiscard={vi.fn()} />)
    const section = await screen.findByTestId('own-drafts')
    for (const name of ['First Bakery', 'Second Bakery', 'Third Bakery']) {
      expect(within(section).getByText(name)).toBeInTheDocument()
      expect(within(section).getByRole('button', { name: `Delete ${name}` })).toBeInTheDocument()
    }
    expect(within(section).getAllByRole('link', { name: /continue/i })).toHaveLength(3)
  })
})
