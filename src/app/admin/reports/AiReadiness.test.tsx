// #640 — the "AI readiness" panel: three harness numbers and the shadow days, each green, amber or red
// (in words as well as colour), and one "ready to go live" light. Staff-only (the page is gated).

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AiReadiness } from './AiReadiness'
import { readiness } from '@/lib/moderation/readiness'

afterEach(cleanup)
const NOW = new Date('2026-10-12T12:00:00Z')
const RUN = { runAt: new Date('2026-10-10T12:00:00Z'), cases: 60, recall: 0.97, sev1Cases: 5, sev1Recall: 1, falseAlarmRate: 0.04 }

describe('AiReadiness', () => {
  it('shows each number against its target, with the date of the last run', () => {
    render(<AiReadiness readiness={readiness({ run: RUN, shadowDays: 9, now: NOW })} />)
    const recall = screen.getByTestId('ai-readiness-recall')
    expect(recall).toHaveTextContent('97%')
    expect(recall).toHaveTextContent('target 95% or more')
    expect(recall).toHaveTextContent('Oct 10')
    expect(screen.getByTestId('ai-readiness-sev1')).toHaveTextContent('100%')
    expect(screen.getByTestId('ai-readiness-sev1')).toHaveTextContent('target 100%')
    expect(screen.getByTestId('ai-readiness-false-alarms')).toHaveTextContent('4%')
    expect(screen.getByTestId('ai-readiness-false-alarms')).toHaveTextContent('target under 10%')
    expect(screen.getByTestId('ai-readiness-shadow')).toHaveTextContent('9 of 14 days')
  })

  it('says green, amber or red in words, not only in colour', () => {
    render(<AiReadiness readiness={readiness({ run: { ...RUN, recall: 0.92 }, shadowDays: 9, now: NOW })} />)
    expect(within(screen.getByTestId('ai-readiness-recall')).getByText('Close')).toBeInTheDocument()
    expect(within(screen.getByTestId('ai-readiness-sev1')).getByText('Met')).toBeInTheDocument()
    expect(within(screen.getByTestId('ai-readiness-shadow')).getByText('Close')).toBeInTheDocument()
    render(<AiReadiness readiness={readiness({ run: { ...RUN, falseAlarmRate: 0.4 }, shadowDays: 1, now: NOW })} />)
    expect(within(screen.getAllByTestId('ai-readiness-false-alarms')[1]!).getByText('Not met')).toBeInTheDocument()
  })

  it('has one overall light: ready only when everything is met', () => {
    render(<AiReadiness readiness={readiness({ run: RUN, shadowDays: 14, now: NOW })} />)
    expect(screen.getByTestId('ai-readiness-overall')).toHaveTextContent('Ready to go live')
    cleanup()
    render(<AiReadiness readiness={readiness({ run: RUN, shadowDays: 13, now: NOW })} />)
    expect(screen.getByTestId('ai-readiness-overall')).toHaveTextContent('Not ready to go live yet')
  })

  it('with no harness run it says so instead of showing a number', () => {
    render(<AiReadiness readiness={readiness({ run: null, shadowDays: 0, now: NOW })} />)
    expect(screen.getByTestId('ai-readiness-recall')).toHaveTextContent('No run yet')
    expect(screen.getByTestId('ai-readiness-recall').textContent).not.toMatch(/\d%\s*·/)
  })

  it('a set with no severity-1 cases says what that means', () => {
    render(<AiReadiness readiness={readiness({ run: { ...RUN, sev1Cases: 0, sev1Recall: 0 }, shadowDays: 14, now: NOW })} />)
    expect(screen.getByTestId('ai-readiness-sev1')).toHaveTextContent(/no severity-1 cases/i)
  })

  it('says it is for the flip Don does himself, and that the software does not stop it yet', () => {
    render(<AiReadiness readiness={readiness({ run: RUN, shadowDays: 14, now: NOW })} />)
    expect(screen.getByTestId('ai-readiness')).toHaveTextContent(/nothing stops the switch yet/i)
  })
})
