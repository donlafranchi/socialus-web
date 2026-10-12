import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { YouNotices, type Notice } from './YouNotices'

afterEach(cleanup)

const notice = (over: Partial<Notice> = {}): Notice => ({
  id: 'n1',
  message: 'Someone reported a post on Oak Park Bakery as "Spam", so we\'ve hidden it.',
  createdAt: '2026-10-07T12:00:00Z',
  kind: 'content_hidden',
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
  it('a hidden post offers "Fix it" (to its Page) and "Tell us it\'s a mistake"', () => {
    render(<YouNotices notices={[notice()]} onAnswer={vi.fn()} />)
    expect(screen.getByRole('link', { name: /fix it/i })).toHaveAttribute('href', '/g/qa0b01')
    expect(screen.getByRole('button', { name: /this is a mistake/i })).toBeInTheDocument()
  })

  it('a hidden photo has no repost, only the mistake answer', () => {
    render(<YouNotices notices={[notice({ subjectKind: 'group' })]} onAnswer={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /fix it/i })).toBeNull()
    expect(screen.getByRole('button', { name: /this is a mistake/i })).toBeInTheDocument()
  })

  // [guards F102.3 partial: one tap, no reasons or note to fill in (#626)]
  it('is one button: no reasons, no box, one tap sends the claim', async () => {
    const onAnswer = vi.fn(async () => {})
    render(<YouNotices notices={[notice()]} onAnswer={onAnswer} />)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^this is a mistake$/i }))
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ noticeId: 'n1' }))
    await waitFor(() => expect(screen.getByTestId('notice-answered')).toHaveTextContent(/top of our review list/i))
    expect(screen.queryByRole('button', { name: /this is a mistake/i })).toBeNull()
  })

  it('a failed tap says so in plain words and leaves the button', async () => {
    render(<YouNotices notices={[notice()]} onAnswer={vi.fn(async () => { throw new Error('report.answer: boom') })} />)
    fireEvent.click(screen.getByRole('button', { name: /this is a mistake/i }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toMatch(/report\.answer/)
    expect(screen.getByRole('button', { name: /this is a mistake/i })).toBeInTheDocument()
  })

  it('a courtesy notice offers the same one button, and "Fix it" on a post', () => {
    render(<YouNotices notices={[notice({ kind: 'courtesy' })]} onAnswer={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^this is a mistake$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /fix it/i })).toBeInTheDocument()
  })

  it('a claimed courtesy notice says it will go to the top if reported again', () => {
    render(<YouNotices notices={[notice({ kind: 'courtesy', answer: 'mistake' })]} onAnswer={vi.fn()} />)
    expect(screen.getByTestId('notice-answered')).toHaveTextContent(/reported again/i)
  })

  it('once answered it says so and stays hidden until a person looks; no second answer', () => {
    render(<YouNotices notices={[notice({ answer: 'mistake' })]} onAnswer={vi.fn()} />)
    expect(screen.getByTestId('notice-answered')).toHaveTextContent(/top of our review list/i)
    expect(screen.queryByRole('button', { name: /this is a mistake/i })).toBeNull()
  })

  it('after a repost it says it is showing again', () => {
    render(<YouNotices notices={[notice({ answer: 'fix_and_repost' })]} onAnswer={vi.fn()} />)
    expect(screen.getByTestId('notice-answered')).toHaveTextContent(/showing again/i)
  })

  // [guards F102.4 partial: an unanswered hide closes itself]
  it('a hide that has closed itself offers nothing', () => {
    render(<YouNotices notices={[notice({ closed: true })]} onAnswer={vi.fn()} />)
    expect(screen.getByTestId('notice-closed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /this is a mistake/i })).toBeNull()
  })
})
