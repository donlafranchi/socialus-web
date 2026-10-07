import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { YouNotices, type Notice } from './YouNotices'

afterEach(cleanup)

const notice = (over: Partial<Notice> = {}): Notice => ({
  id: 'n1',
  message: 'Someone reported a post on Oak Park Bakery as "Spam", so we\'ve hidden it.',
  createdAt: '2026-10-07T12:00:00Z',
  subjectKind: 'post',
  pageHandle: 'qa0b01',
  answer: null,
  closed: false,
  ...over,
})

describe('F078 — YouNotices', () => {
  // [guards F078.3 partial: the in-app message; the content is the handler's]
  it('shows each notice the poster has been sent', () => {
    render(<YouNotices notices={[notice()]} />)
    expect(screen.getByText(notice().message)).toBeInTheDocument()
  })

  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<YouNotices notices={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('F102 criteria 1–4 — the poster answers first', () => {
  it('a hidden post offers "Fix it" (to its Page) and "Say it\'s a mistake"', () => {
    render(<YouNotices notices={[notice()]} onAnswer={vi.fn()} />)
    expect(screen.getByRole('link', { name: /fix it/i })).toHaveAttribute('href', '/g/qa0b01')
    expect(screen.getByRole('button', { name: /say it.s a mistake/i })).toBeInTheDocument()
  })

  it('a hidden photo has no repost, only the mistake answer', () => {
    render(<YouNotices notices={[notice({ subjectKind: 'group' })]} onAnswer={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /fix it/i })).toBeNull()
    expect(screen.getByRole('button', { name: /say it.s a mistake/i })).toBeInTheDocument()
  })

  it('offers three reasons and a note of 280 characters, and sends one answer', async () => {
    const onAnswer = vi.fn(async () => {})
    render(<YouNotices notices={[notice()]} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole('button', { name: /say it.s a mistake/i }))
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['mistaken', 'malicious', 'misusing_reports'])
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '280')
    const send = screen.getByRole('button', { name: /^send$/i })
    expect(send).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/misusing reports/i))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'It is my own sign.' } })
    fireEvent.click(send)
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ noticeId: 'n1', reason: 'misusing_reports', note: 'It is my own sign.' }))
  })

  it('once answered it says so and stays hidden until a person looks; no second answer', () => {
    render(<YouNotices notices={[notice({ answer: 'wrong' })]} onAnswer={vi.fn()} />)
    expect(screen.getByTestId('notice-answered')).toHaveTextContent(/got your answer/i)
    expect(screen.queryByRole('button', { name: /say it.s a mistake/i })).toBeNull()
  })

  it('after a repost it says it is showing again', () => {
    render(<YouNotices notices={[notice({ answer: 'fix_and_repost' })]} onAnswer={vi.fn()} />)
    expect(screen.getByTestId('notice-answered')).toHaveTextContent(/showing again/i)
  })

  // [guards F102.4 partial: an unanswered hide closes itself]
  it('a hide that has closed itself offers nothing', () => {
    render(<YouNotices notices={[notice({ closed: true })]} onAnswer={vi.fn()} />)
    expect(screen.getByTestId('notice-closed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /say it.s a mistake/i })).toBeNull()
  })
})
