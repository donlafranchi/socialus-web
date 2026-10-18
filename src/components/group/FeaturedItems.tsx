'use client'

// #909 — a Page's featured products and services (Don, 2026-10-18). Visitors see a tidy grid; the people who
// manage the Page tap one to edit it, or Add, in a sheet: a name and Save is enough. Up to 12.

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { SampleLabel } from '@/components/cards/CardMarks'
import { PagePhotoPicker } from '@/components/media/PagePhotoPicker'
import { ReportControl } from './ReportControl'
import type { ReportCategory } from '@/lib/reports/categories'
import type { ActionResult } from '@/app/you/sell/action-result'
import {
  FEATURED_ITEMS_MAX,
  formatPrice,
  parsePrice,
  sourceHost,
  type FeaturedItem,
  type FeaturedKind,
} from '@/lib/items/featured'

export interface FeaturedSaveInput {
  groupId: string
  itemId?: string
  kind: FeaturedKind
  name: string
  details?: string
  priceCents: number | null
  inStock: boolean
  photoUrl: string | null
}

interface Props {
  groupId: string
  items: FeaturedItem[]
  canEdit: boolean
  /** Whose upload folder a photo goes to; null hides the photo control. */
  memberId: string | null
  onSave: (input: FeaturedSaveInput) => Promise<ActionResult<{ itemId: string }> | { ok: true; data: { itemId: string } } | { ok: false; message: string }>
  onRemove: (input: { groupId: string; itemId: string }) => Promise<ActionResult<{ itemId: string }> | { ok: true; data: { itemId: string } } | { ok: false; message: string }>
  /** #909 — a visitor reports one item; the owner never gets the control on their own. */
  report?: {
    loggedIn: boolean
    returnTo?: string
    onSend: (input: { subjectId: string; subjectKind?: 'page_item'; category: ReportCategory; body: string }) => Promise<{ ok: true } | { ok: false; message: string }>
  }
}

type Draft = { itemId?: string; kind: FeaturedKind; name: string; details: string; price: string; inStock: boolean; photoUrl: string | null }

const blank = (): Draft => ({ kind: 'product', name: '', details: '', price: '', inStock: true, photoUrl: null })
const fromItem = (i: FeaturedItem): Draft => ({
  itemId: i.id,
  kind: i.kind,
  name: i.name,
  details: i.details,
  price: i.priceCents == null ? '' : (i.priceCents / 100).toFixed(2).replace(/\.00$/, ''),
  inStock: i.inStock,
  photoUrl: i.photoUrl,
})

const TRY_AGAIN = "That didn't save. Mind trying again?"

export function FeaturedItems({ groupId, items: initial, canEdit, memberId, onSave, onRemove, report }: Props) {
  const [items, setItems] = useState(initial)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (items.length === 0 && !canEdit) return null
  const full = items.length >= FEATURED_ITEMS_MAX

  const open = (d: Draft) => {
    setDraft(d)
    setError(null)
    setPriceError(null)
  }

  const save = async () => {
    if (!draft) return
    const priceCents = parsePrice(draft.price)
    if (priceCents === undefined) {
      setPriceError('Write a price like 4.50, or leave it blank.')
      return
    }
    setPriceError(null)
    setBusy(true)
    const input: FeaturedSaveInput = {
      groupId,
      ...(draft.itemId ? { itemId: draft.itemId } : {}),
      kind: draft.kind,
      name: draft.name.trim(),
      ...(draft.details.trim() ? { details: draft.details.trim() } : {}),
      priceCents,
      inStock: draft.inStock,
      photoUrl: draft.photoUrl,
    }
    const prev = items.find((i) => i.id === draft.itemId)
    const r = await onSave(input)
    setBusy(false)
    if (!r.ok) {
      setError(r.message || TRY_AGAIN)
      return
    }
    const saved: FeaturedItem = {
      id: r.data.itemId,
      kind: input.kind,
      name: input.name,
      details: input.details ?? '',
      priceCents,
      inStock: input.inStock,
      photoUrl: input.photoUrl,
      sampleSourceUrl: null,
      // The server clears a report's hide only when the words change.
      hidden: Boolean(prev?.hidden && prev.name === input.name && prev.details === (input.details ?? '')),
    }
    setItems(draft.itemId ? items.map((i) => (i.id === draft.itemId ? saved : i)) : [...items, saved])
    setDraft(null)
  }

  const remove = async () => {
    if (!draft?.itemId) return
    setBusy(true)
    const r = await onRemove({ groupId, itemId: draft.itemId })
    setBusy(false)
    if (!r.ok) {
      setError(r.message || TRY_AGAIN)
      return
    }
    setItems(items.filter((i) => i.id !== draft.itemId))
    setDraft(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <div data-testid="featured-empty-owner" className="flex flex-col items-start gap-2 text-body-sm text-[var(--color-fg-muted)]">
          <p>Show people a few things you sell or offer. Only you see this until you add one.</p>
          <Button variant="secondary" size="sm" onClick={() => open(blank())}>
            <Plus size={16} aria-hidden="true" /> Add your first product or service
          </Button>
        </div>
      ) : (
        <ul data-testid="featured-items" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((i) => (
            <li key={i.id}>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Edit ${i.name}`}
                  onClick={() => open(fromItem(i))}
                  className="press block w-full text-left"
                >
                  <ItemCard item={i} editing />
                </button>
              ) : (
                <div className="relative">
                  <ItemCard item={i} />
                  {report && (
                    <div className="absolute right-1 top-1 rounded-full bg-white/90">
                      <ReportControl
                        subjectId={i.id}
                        subjectKind="page_item"
                        subjectLabel={i.name}
                        loggedIn={report.loggedIn}
                        returnTo={report.returnTo}
                        onSend={(input) => report.onSend({ ...input, subjectKind: 'page_item' })}
                      />
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && items.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-[var(--color-fg-muted)]">
            {items.length} of {FEATURED_ITEMS_MAX}
          </span>
          {!full && (
            <Button variant="secondary" size="sm" onClick={() => open(blank())}>
              <Plus size={16} aria-hidden="true" /> Add
            </Button>
          )}
        </div>
      )}

      <Sheet
        open={draft !== null}
        title={draft?.itemId ? 'Edit' : 'Add a product or service'}
        onClose={() => setDraft(null)}
        testId="featured-item-sheet"
        footer={
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || !draft?.name.trim()}>
              Save
            </Button>
            {draft?.itemId && (
              <Button variant="secondary" onClick={remove} disabled={busy}>
                Remove
              </Button>
            )}
          </div>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <div role="radiogroup" aria-label="Product or service" className="flex gap-2">
              {(['product', 'service'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={draft.kind === k}
                  onClick={() => setDraft({ ...draft, kind: k })}
                  className={`min-h-tap flex-1 rounded-md border px-3 text-body-sm font-medium ${
                    draft.kind === k
                      ? 'border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-fg)]'
                      : 'border-[var(--color-border)] text-[var(--color-fg-muted)]'
                  }`}
                >
                  {k === 'product' ? 'Product' : 'Service'}
                </button>
              ))}
            </div>
            <Field label="Name">
              {(p) => (
                <input
                  {...p}
                  autoFocus
                  maxLength={80}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="input"
                />
              )}
            </Field>
            <Field label="Price (optional)" error={priceError}>
              {(p) => (
                <input
                  {...p}
                  inputMode="decimal"
                  placeholder="$"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  className="input"
                />
              )}
            </Field>
            <label className="flex min-h-tap cursor-pointer items-center justify-between gap-3">
              <span className="text-body-sm text-[var(--color-fg)]">{draft.kind === 'product' ? 'In stock' : 'Available'}</span>
              <input
                type="checkbox"
                role="switch"
                aria-label={draft.kind === 'product' ? 'In stock' : 'Available'}
                className="h-5 w-5"
                checked={draft.inStock}
                onChange={(e) => setDraft({ ...draft, inStock: e.target.checked })}
              />
            </label>
            {memberId && (
              <PagePhotoPicker
                memberId={memberId}
                value={draft.photoUrl}
                onChange={(url) => setDraft({ ...draft, photoUrl: url })}
                label="Photo (optional)"
                previewAlt={`The photo of ${draft.name || 'this'}`}
              />
            )}
            <Field label="Details (optional)">
              {(p) => (
                <input
                  {...p}
                  maxLength={280}
                  value={draft.details}
                  onChange={(e) => setDraft({ ...draft, details: e.target.value })}
                  className="input"
                />
              )}
            </Field>
            {error && (
              <p className="text-caption text-red-700" role="status">
                {error}
              </p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}

function ItemCard({ item, editing = false }: { item: FeaturedItem; editing?: boolean }) {
  const price = formatPrice(item.priceCents)
  const host = item.sampleSourceUrl ? sourceHost(item.sampleSourceUrl) : null
  return (
    <div data-testid="featured-item" className={`flex flex-col gap-1 ${item.inStock ? '' : 'opacity-60'}`}>
      <div className="aspect-square w-full overflow-hidden rounded-md bg-[var(--color-surface)]">
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div aria-hidden="true" className="flex h-full w-full items-center justify-center text-title-2 text-[var(--color-fg-muted)]">
            {item.name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1 text-body-sm font-medium text-[var(--color-fg)] [overflow-wrap:anywhere]">{item.name}</span>
        {item.sampleSourceUrl && <SampleLabel />}
      </div>
      {price && <span className="text-body-sm text-[var(--color-fg)]">{price}</span>}
      {editing && item.hidden && (
        <span data-testid="featured-item-hidden" className="text-caption text-[var(--color-fg-muted)]">
          Hidden after a report. Change its name or details to show it again.
        </span>
      )}
      {!item.inStock && (
        <span className="text-caption text-[var(--color-fg-muted)]">{item.kind === 'product' ? 'Out of stock' : 'Not available now'}</span>
      )}
      {item.details && <span className="text-caption text-[var(--color-fg-muted)] line-clamp-2">{item.details}</span>}
      {host && item.sampleSourceUrl && (
        <span className="text-caption text-[var(--color-fg-muted)]">
          From{' '}
          {editing ? (
            host
          ) : (
            <a href={item.sampleSourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
              {host}
            </a>
          )}
        </span>
      )}
    </div>
  )
}
