import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CodeEntry } from './CodeEntry'

// #927 — the emailed 6-digit code: the fallback when a link is opened in another browser.
const verifyEmailCode = vi.fn()
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ verifyEmailCode }) }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const type = (v: string) => fireEvent.change(screen.getByTestId('code-input'), { target: { value: v } })
const go = () => fireEvent.click(screen.getByTestId('code-submit'))

describe('CodeEntry', () => {
  it('is a numeric one-time-code field a phone can fill from the email', () => {
    render(<CodeEntry email="a@b.co" next="/you" onDone={vi.fn()} />)
    const input = screen.getByTestId('code-input')
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('inputmode', 'numeric')
  })
  it('verifies the code for that email and continues to next', async () => {
    verifyEmailCode.mockResolvedValue({ error: null })
    const onDone = vi.fn()
    render(<CodeEntry email="a@b.co" next="/you" onDone={onDone} />)
    type('123 456')
    go()
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('/you'))
    expect(verifyEmailCode).toHaveBeenCalledWith('a@b.co', '123456')
  })
  it('says so when the code is wrong or expired, and does not continue', async () => {
    verifyEmailCode.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    const onDone = vi.fn()
    render(<CodeEntry email="a@b.co" next="/" onDone={onDone} />)
    type('000000')
    go()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onDone).not.toHaveBeenCalled()
  })
  it('does not call out for anything but six digits', () => {
    render(<CodeEntry email="a@b.co" next="/" onDone={vi.fn()} />)
    type('12345')
    go()
    expect(verifyEmailCode).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
