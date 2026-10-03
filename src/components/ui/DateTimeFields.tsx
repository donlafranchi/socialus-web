'use client'

// #317 — date and time fields. Touch devices keep the phone's own pickers
// (native inputs); a laptop or desktop (a fine pointer, or 1024px and up) gets
// a calendar popover for the date and a typeable time with 15-minute slots.
// Values stay what the native inputs emit: `yyyy-mm-dd` and `hh:mm`.

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { CalendarDays } from 'lucide-react'
import { useMediaQuery } from '@/hooks/useMediaQuery'

const DESKTOP = '(pointer: fine), (min-width: 1024px)'
const FIELD = 'input min-h-tap w-full'

const toDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}
const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const showDate = (ymd: string) =>
  ymd
    ? toDate(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Choose a date'

interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  testId?: string
}

export function DateField({ label, value, min, onChange, testId }: FieldProps & { min?: string }) {
  const desktop = useMediaQuery(DESKTOP)
  const id = useId()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    pop.current?.querySelector<HTMLElement>('[aria-selected="true"] button, button:not([disabled])')?.focus()
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  const close = () => {
    setOpen(false)
    button.current?.focus()
  }

  return (
    <label className="relative flex flex-col gap-1" htmlFor={id}>
      <span className="text-caption text-[var(--color-fg-muted)]">{label}</span>
      {!desktop ? (
        <input
          id={id}
          type="date"
          data-testid={testId}
          min={min}
          className={FIELD}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <>
          <button
            id={id}
            ref={button}
            type="button"
            data-testid={testId}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={`${FIELD} flex items-center justify-between text-left`}
          >
            <span>{showDate(value)}</span>
            <CalendarDays size={16} aria-hidden="true" />
          </button>
          {open && (
            <div
              ref={pop}
              role="dialog"
              aria-label="Choose a date"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  close()
                }
              }}
              className="absolute left-0 top-full z-[var(--z-panel)] mt-1 rounded-lg border border-[var(--color-border)] bg-white p-2 shadow-overlay"
              style={{ '--rdp-accent-color': 'var(--color-charcoal-700)', '--rdp-accent-background-color': 'var(--color-charcoal-100)' } as CSSProperties}
            >
              <DayPicker
                mode="single"
                selected={value ? toDate(value) : undefined}
                defaultMonth={value ? toDate(value) : min ? toDate(min) : undefined}
                disabled={min ? { before: toDate(min) } : undefined}
                onSelect={(d) => {
                  if (!d) return
                  onChange(toYmd(d))
                  close()
                }}
              />
            </div>
          )}
        </>
      )}
    </label>
  )
}

const SLOTS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)

/** "19:30" → "7:30 PM". */
export function showTime(hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** The ways people type a time → "hh:mm", or null. */
export function parseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '')
  if (s === 'noon') return '12:00'
  if (s === 'midnight') return '00:00'
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/.exec(s)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? '0')
  const ampm = m[3]?.[0]
  if (min > 59) return null
  if (ampm) {
    if (h < 1 || h > 12) return null
    if (ampm === 'p' && h !== 12) h += 12
    if (ampm === 'a' && h === 12) h = 0
  } else if (h > 23) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function TimeField({ label, value, onChange, testId }: FieldProps) {
  const desktop = useMediaQuery(DESKTOP)
  const id = useId()
  const listId = `${id}-slots`
  const [text, setText] = useState(showTime(value))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)

  // Follow the value when it changes from outside (the end following the
  // start), during render rather than in an effect.
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setText(showTime(value))
  }
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])

  const openList = () => {
    const near = value ? SLOTS.findIndex((s) => s >= value) : 36
    setActive(near < 0 ? 0 : near)
    setOpen(true)
  }
  const choose = (slot: string) => {
    onChange(slot)
    setText(showTime(slot))
    setOpen(false)
  }
  const commit = () => {
    const t = parseTime(text)
    if (t && t !== value) onChange(t)
    else setText(showTime(value))
  }

  if (!desktop) {
    return (
      <label className="flex flex-col gap-1" htmlFor={id}>
        <span className="text-caption text-[var(--color-fg-muted)]">{label}</span>
        <input id={id} type="time" data-testid={testId} className={FIELD} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }

  return (
    <label className="relative flex flex-col gap-1" htmlFor={id}>
      <span className="text-caption text-[var(--color-fg-muted)]">{label}</span>
      <input
        id={id}
        role="combobox"
        data-testid={testId}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={FIELD}
        value={text}
        placeholder="7:00 PM"
        onChange={(e) => setText(e.target.value)}
        onFocus={openList}
        onBlur={() => {
          commit()
          setOpen(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!open) return openList()
            setActive((a) => Math.min(95, Math.max(0, a + (e.key === 'ArrowDown' ? 1 : -1))))
          } else if (e.key === 'Enter' && open) {
            e.preventDefault()
            choose(SLOTS[active]!)
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          ref={list}
          role="listbox"
          aria-label={`${label} times`}
          className="absolute left-0 right-0 top-full z-[var(--z-panel)] mt-1 max-h-60 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-overlay"
        >
          {SLOTS.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={s === value}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(s)
              }}
              onClick={() => choose(s)}
              className={`cursor-pointer px-3 py-2 text-body-sm ${i === active ? 'bg-[var(--color-surface)]' : ''} ${s === value ? 'font-semibold' : ''}`}
            >
              {showTime(s)}
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}
