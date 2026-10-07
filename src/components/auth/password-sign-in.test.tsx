import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MagicLinkForm } from './MagicLinkForm'
import { PasswordForm } from './PasswordForm'

// #407 — email and password alongside the link (the PM, 2026-10-05).

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  signIn: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/lib/auth/save-login', () => ({ offerToSaveLogin: vi.fn(async () => {}) }))

const assign = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  auth.signInWithOtp.mockResolvedValue({ error: null })
  auth.signIn.mockResolvedValue({ data: {}, error: null })
  auth.resetPassword.mockResolvedValue({ error: null })
  auth.updatePassword.mockResolvedValue({ error: null })
  vi.stubGlobal('location', { ...window.location, assign })
})
afterEach(cleanup)

const type = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } })

describe('#407 — sign in with a password', () => {
  it('offers the link first, and a password on request', () => {
    render(<MagicLinkForm next="/you" />)
    expect(screen.queryByTestId('password-input')).toBeNull()
    fireEvent.click(screen.getByTestId('use-password'))
    expect(screen.getByTestId('password-input')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('signs in with email and password and goes on to next', async () => {
    render(<MagicLinkForm next="/you" />)
    fireEvent.click(screen.getByTestId('use-password'))
    type('email-input', 'maya@example.test')
    type('password-input', 'correct horse')
    fireEvent.click(screen.getByTestId('submit-button'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/you'))
    expect(auth.signIn).toHaveBeenCalledWith('maya@example.test', 'correct horse')
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('says so when they do not match, and stays put', async () => {
    auth.signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })
    render(<MagicLinkForm />)
    fireEvent.click(screen.getByTestId('use-password'))
    type('email-input', 'maya@example.test')
    type('password-input', 'wrong')
    fireEvent.click(screen.getByTestId('submit-button'))
    expect(await screen.findByTestId('auth-error')).toHaveTextContent(/don’t match/)
    expect(assign).not.toHaveBeenCalled()
  })

  it('emails a reset link for the address entered', async () => {
    render(<MagicLinkForm />)
    fireEvent.click(screen.getByTestId('use-password'))
    type('email-input', 'maya@example.test')
    fireEvent.click(screen.getByTestId('forgot-password'))
    await screen.findByTestId('magic-sent-message')
    expect(auth.resetPassword).toHaveBeenCalledWith('maya@example.test')
  })

  it('still sends the link by default', async () => {
    render(<MagicLinkForm next="/you" />)
    type('email-input', 'maya@example.test')
    fireEvent.click(screen.getByTestId('submit-button'))
    await screen.findByTestId('magic-sent-message')
    expect(auth.signInWithOtp).toHaveBeenCalledWith('maya@example.test', '/you')
  })
})

describe('#407 — set or change the password on You', () => {
  it('refuses one under 8 characters', async () => {
    render(<PasswordForm email="maya@example.test" />)
    type('new-password-input', 'short')
    fireEvent.click(screen.getByTestId('save-password'))
    expect(await screen.findByTestId('password-error')).toBeInTheDocument()
    expect(auth.updatePassword).not.toHaveBeenCalled()
  })

  it('saves it', async () => {
    render(<PasswordForm email="maya@example.test" />)
    type('new-password-input', 'correct horse')
    fireEvent.click(screen.getByTestId('save-password'))
    await screen.findByTestId('password-saved')
    expect(auth.updatePassword).toHaveBeenCalledWith('correct horse')
  })
})
