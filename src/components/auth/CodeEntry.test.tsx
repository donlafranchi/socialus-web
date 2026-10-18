import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CodeEntry, RESEND_SECONDS } from './CodeEntry'

// The emailed 6-digit code, the one way in (the PM, 2026-10-18).
const verifyEmailCode = vi.fn()
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ verifyEmailCode }) }))

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })

const type = (v: string) => fireEvent.change(screen.getByTestId('code-input'), { target: { value: v } })
const go = () => fireEvent.click(screen.getByTestId('code-submit'))

describe('CodeEntry', () => {
  it('is a numeric one-time-code field a phone can fill from the email', () => {
    render(<CodeEntry email="a@b.co" next="/you" onDone={vi.fn()} />)
    const input = screen.getByTestId('code-input')
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).not.toHaveAttribute('maxlength')
  })
  it('signs in on the sixth digit without a tap', async () => {
    verifyEmailCode.mockResolvedValue({ error: null })
    const onDone = vi.fn()
    render(<CodeEntry email="a@b.co" next="/you" onDone={onDone} />)
    type('12345')
    expect(verifyEmailCode).not.toHaveBeenCalled()
    type('123456')
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('/you'))
    expect(verifyEmailCode).toHaveBeenCalledWith('a@b.co', '123456')
  })
  it('takes a pasted line from the email down to its six digits', async () => {
    verifyEmailCode.mockResolvedValue({ error: null })
    render(<CodeEntry email="a@b.co" next="/" onDone={vi.fn()} />)
    type('Your SocialUs code: 482 913')
    await waitFor(() => expect(verifyEmailCode).toHaveBeenCalledWith('a@b.co', '482913'))
    expect(screen.getByTestId('code-input')).toHaveValue('482913')
  })
  it('never sends more than six digits (an 8-digit code is cut to 6)', () => {
    render(<CodeEntry email="a@b.co" next="/" onDone={vi.fn()} />)
    type('12345678')
    expect(screen.getByTestId('code-input')).toHaveValue('123456')
  })
  it('says so in plain words when the code is wrong or expired, and does not continue', async () => {
    verifyEmailCode.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    const onDone = vi.fn()
    render(<CodeEntry email="a@b.co" next="/" onDone={onDone} />)
    type('000000')
    expect(await screen.findByTestId('code-error')).toHaveTextContent('wrong or has expired')
    expect(onDone).not.toHaveBeenCalled()
  })
  it('does not call out for fewer than six digits', () => {
    render(<CodeEntry email="a@b.co" next="/" onDone={vi.fn()} />)
    type('12345')
    go()
    expect(verifyEmailCode).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
  it('lets you resend only after a minute, then confirms the new code', async () => {
    vi.useFakeTimers()
    const onResend = vi.fn(async () => ({ error: null }))
    render(<CodeEntry email="a@b.co" next="/" onDone={vi.fn()} onResend={onResend} />)
    const resend = screen.getByTestId('resend-code')
    expect(resend).toBeDisabled()
    expect(resend).toHaveTextContent(`Resend code in ${RESEND_SECONDS}s`)
    for (let i = 0; i < RESEND_SECONDS; i++) await act(async () => { vi.advanceTimersByTime(1000) })
    expect(resend).toBeEnabled()
    await act(async () => { fireEvent.click(resend) })
    expect(onResend).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('code-notice')).toHaveTextContent('We sent a new code')
    expect(resend).toBeDisabled()
  })
  it('offers a way back to change the email', () => {
    const onChangeEmail = vi.fn()
    render(<CodeEntry email="a@b.co" next="/" onDone={vi.fn()} onChangeEmail={onChangeEmail} />)
    fireEvent.click(screen.getByTestId('change-email'))
    expect(onChangeEmail).toHaveBeenCalled()
  })
})
