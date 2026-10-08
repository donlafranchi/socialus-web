// #443 — the form: one box, one button, and a way back.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ReportProblemForm } from './ReportProblemForm'

afterEach(cleanup)

describe('ReportProblemForm', () => {
  it('asks for what went wrong, and nothing else a person can see', () => {
    render(<ReportProblemForm route="/g/abc" onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/what went wrong/i)).toBeInTheDocument()
    expect(screen.getByTestId('report-form').querySelectorAll('textarea,input:not([aria-hidden])')).toHaveLength(1)
  })

  it('will not send an empty report', async () => {
    const onSubmit = vi.fn()
    render(<ReportProblemForm route="/" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('sends the words and the route, then says thanks', async () => {
    const onSubmit = vi.fn(async () => ({ ok: true as const }))
    render(<ReportProblemForm route="/g/abc" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/what went wrong/i), { target: { value: '  The Save button did nothing ' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ description: 'The Save button did nothing', route: '/g/abc', website: '' }))
    expect(await screen.findByTestId('report-thanks')).toBeInTheDocument()
  })

  it('shows a refusal and keeps what was typed', async () => {
    const onSubmit = vi.fn(async () => ({ ok: false as const, message: 'Too many reports just now. Try again in a while.' }))
    render(<ReportProblemForm route="/" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/what went wrong/i), { target: { value: 'It broke' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many/i)
    expect(screen.getByLabelText(/what went wrong/i)).toHaveValue('It broke')
  })
})
