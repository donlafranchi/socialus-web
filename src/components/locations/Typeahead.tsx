'use client'

// #413 — a text field that suggests as you type: the WAI-ARIA combobox with a
// listbox popup (arrow keys, Enter, Escape), as Google's address field does.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { MAP_DEFAULTS } from '@/lib/map-config'

export function Typeahead<T>({
  label,
  placeholder,
  autoComplete = 'off',
  minChars,
  search,
  optionKey,
  optionLabel,
  onPick,
  emptyMessage,
}: {
  label: ReactNode
  placeholder?: string
  autoComplete?: string
  minChars: number
  search: (q: string) => Promise<T[]>
  optionKey: (o: T) => string
  optionLabel: (o: T) => string
  onPick: (o: T) => void
  emptyMessage?: ReactNode
}) {
  const id = useId()
  const listId = `${id}-list`
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<T[] | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const type = (q: string) => {
    setQuery(q)
    setActive(-1)
    clearTimeout(timer.current)
    const n = ++seq.current
    if (q.trim().length < minChars) return setResults(null)
    timer.current = setTimeout(async () => {
      const found = await search(q).catch(() => [])
      if (n !== seq.current) return
      setResults(found)
      setOpen(true)
    }, MAP_DEFAULTS.debounceMs)
  }

  const pick = (o: T) => {
    seq.current++
    setQuery(optionLabel(o))
    setResults(null)
    setOpen(false)
    setActive(-1)
    onPick(o)
  }

  const options = open && results ? results : []
  const expanded = options.length > 0
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results?.length) return
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((a) => (a + step + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (expanded && active >= 0) pick(options[active]!)
    } else if (e.key === 'Escape' && open && results) {
      // Close the suggestions only; the sheet around them stays open.
      e.stopPropagation()
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-[var(--color-fg)]">{label}</span>
        <input
          className="input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${id}-${active}` : undefined}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={query}
          onChange={(e) => type(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          onFocus={() => results && setOpen(true)}
        />
      </label>
      {expanded && (
        <ul id={listId} role="listbox" className="flex flex-col rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]">
          {options.map((o, i) => (
            <li
              key={optionKey(o)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex min-h-tap cursor-pointer items-center px-3 text-sm ${i === active ? 'bg-[var(--color-surface)]' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              {optionLabel(o)}
            </li>
          ))}
        </ul>
      )}
      {open && results?.length === 0 && emptyMessage && <p className="text-caption text-[var(--color-fg-muted)]">{emptyMessage}</p>}
    </div>
  )
}
