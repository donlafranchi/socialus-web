import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AddToCalendarLink } from './AddToCalendarLink'
import { COPY } from '@/lib/copy'

afterEach(cleanup)

describe('AddToCalendarLink', () => {
  it('downloads an .ics of the event', () => {
    render(<AddToCalendarLink uid="p1@socialus.org" title="Bread class" start="2026-09-11T02:00:00Z" url="https://x/y" />)
    const a = screen.getByRole('link', { name: COPY.addToCalendar })
    expect(a.getAttribute('href')).toMatch(/^data:text\/calendar;charset=utf-8,BEGIN%3AVCALENDAR/)
    expect(a.getAttribute('download')).toBe('bread-class.ics')
  })
})
