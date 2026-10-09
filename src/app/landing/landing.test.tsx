// /landing — a preview, not a door: noindex, linked from nowhere else in the
// app, and the form says what happened without a count.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import LandingPage, { metadata } from './page'
import LandingAboutPage, { metadata as aboutMetadata } from './about/page'
import { LandingWaitlistForm } from '@/components/landing/LandingWaitlistForm'
import { ABOUT, LANDING } from '@/lib/landing-copy'

vi.mock('./actions', () => ({ joinLandingWaitlistAction: vi.fn() }))

afterEach(cleanup)

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(f)) out.push(p)
  }
  return out
}

describe('/landing', () => {
  it('is not indexed', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(aboutMetadata.robots).toEqual({ index: false, follow: false })
  })

  it('is linked from nothing outside its own route', () => {
    const files = walk('src').filter((p) => !p.startsWith(join('src', 'app', 'landing')) && !p.includes('components/landing') && !/\.test\.tsx?$/.test(p))
    const offenders = files.filter((p) => /['"`]\/landing/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('renders the headline, the three verbs and the members line', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1, name: LANDING.headline })).toBeTruthy()
    for (const v of LANDING.verbs) expect(screen.getByText(v)).toBeTruthy()
    expect(screen.getByText(LANDING.members.body)).toBeTruthy()
    expect(screen.getByTestId('rotating-item').textContent).toBe(`${LANDING.rotating.items[0]}.`)
  })

  it('the About preview carries all four sections', () => {
    render(<LandingAboutPage />)
    for (const s of ABOUT.sections) expect(screen.getByRole('heading', { level: 2, name: s.title })).toBeTruthy()
  })
})

describe('the waitlist form', () => {
  it('checks the zip and email before sending anything', () => {
    const onSubmit = vi.fn()
    render(<LandingWaitlistForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: LANDING.waitlist.submit }))
    expect(screen.getByRole('alert').textContent).toBe(LANDING.waitlist.errors.email)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('sends the business box as the role and shows the result', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ kind: 'waiting' })
    render(<LandingWaitlistForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(LANDING.waitlist.email), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText(LANDING.waitlist.zip), { target: { value: '95814' } })
    fireEvent.click(screen.getByLabelText(LANDING.waitlist.runs))
    fireEvent.click(screen.getByRole('button', { name: LANDING.waitlist.submit }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(LANDING.waitlist.done.waiting))
    expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.co', zip: '95814', runsSomething: true, wouldHelp: false })
  })
})
