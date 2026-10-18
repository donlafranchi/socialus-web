import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SignInForm } from './SignInForm'

// One way in (the PM, 2026-10-18): email, then the emailed code. No password, no link-only path.
const auth = vi.hoisted(() => ({ signInWithOtp: vi.fn(), verifyEmailCode: vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))

beforeEach(() => { localStorage.clear(); auth.signInWithOtp.mockResolvedValue({ error: null }) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

const send = (email: string) => {
  fireEvent.change(screen.getByTestId('email-input'), { target: { value: email } })
  fireEvent.click(screen.getByTestId('submit-button'))
}

describe('SignInForm', () => {
  it('has one email field and one button, and no password anywhere', () => {
    render(<SignInForm />)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Email me a code')
    expect(document.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByText(/password/i)).toBeNull()
  })
  it('sends the code and moves to the code screen', async () => {
    render(<SignInForm next="/following" />)
    send(' maya@example.test ')
    expect(await screen.findByTestId('code-sent')).toHaveTextContent('maya@example.test')
    expect(auth.signInWithOtp).toHaveBeenCalledWith('maya@example.test', '/following')
    expect(screen.getByTestId('code-input')).toBeInTheDocument()
    expect(screen.getByTestId('resend-code')).toBeInTheDocument()
  })
  it('says a rate limit in plain words', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 42 seconds.' } })
    render(<SignInForm />)
    send('maya@example.test')
    expect(await screen.findByTestId('auth-error')).toHaveTextContent('Too many tries. Wait a minute, then try again.')
  })
  it('"Use a different email" goes back with the email kept to edit', async () => {
    render(<SignInForm />)
    send('maya@example.test')
    fireEvent.click(await screen.findByTestId('change-email'))
    expect(screen.getByTestId('email-input')).toHaveValue('maya@example.test')
  })
})
