import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MagicLinkForm } from './MagicLinkForm'
import { EmailFirstSignup, type EmailFirstDeps } from './EmailFirstSignup'
import { LAST_EMAIL_KEY } from '@/lib/auth/remembered-email'

// #332 — sign-in remembers the email and lets password managers do their job.

const signInWithOtp = vi.fn(async () => ({ error: null }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    checkEmailRegistered: vi.fn(),
    signUp: vi.fn(),
    signIn: vi.fn(),
    signInWithOtp,
    signInWithGoogle: vi.fn(),
  }),
}))

function deps(over: Partial<EmailFirstDeps> = {}): EmailFirstDeps {
  return {
    checkEmailRegistered: vi.fn(async () => true),
    signUp: vi.fn(async () => ({ data: { session: {} }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { session: {} }, error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    signInWithGoogle: vi.fn(async () => ({ error: null })),
    ...over,
  }
}

const email = () => screen.getByTestId('email-input') as HTMLInputElement
const submit = () => fireEvent.click(screen.getByTestId('submit-button'))

function expectEmailField(input: HTMLInputElement, autocomplete: string) {
  expect(input.closest('form')).not.toBeNull()
  expect(input).toHaveAttribute('type', 'email')
  expect(input).toHaveAttribute('name', 'email')
  expect(input).toHaveAttribute('autocomplete', autocomplete)
  expect(input).toHaveAttribute('inputmode', 'email')
  expect(input).toHaveAttribute('autocapitalize', 'off')
}

async function toPasswordStep(registered: boolean) {
  const d = deps({ checkEmailRegistered: vi.fn(async () => registered) })
  const onAuthenticated = vi.fn()
  render(<EmailFirstSignup next="/explore" onAuthenticated={onAuthenticated} deps={d} />)
  fireEvent.change(email(), { target: { value: 'maya@example.test' } })
  submit()
  await screen.findByTestId('password-form')
  return { d, onAuthenticated }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('#332 — the email field', () => {
  it('on the email-link sign-in, is a real email field in a form', () => {
    render(<MagicLinkForm />)
    expectEmailField(email(), 'email')
  })

  it('on the password sign-in and sign-up, names itself the username', () => {
    render(<EmailFirstSignup onAuthenticated={vi.fn()} deps={deps()} />)
    expectEmailField(email(), 'username')
  })
})

describe('#332 — the password step', () => {
  it('signing in: the form carries the email as the username, and the password is the current one', async () => {
    await toPasswordStep(true)
    const form = screen.getByTestId('password-form')
    const user = form.querySelector('input[autocomplete="username"]') as HTMLInputElement
    expect(user).toHaveValue('maya@example.test')
    expect(user).toHaveAttribute('name', 'email')
    expect(screen.getByTestId('password-input')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByTestId('password-input')).toHaveAttribute('name', 'password')
  })

  it('setting a password: the password is a new one, still paired with the email', async () => {
    await toPasswordStep(false)
    const form = screen.getByTestId('password-form')
    expect(form.querySelector('input[autocomplete="username"]')).toHaveValue('maya@example.test')
    expect(screen.getByTestId('password-input')).toHaveAttribute('autocomplete', 'new-password')
  })

  it('after a successful sign-in, offers to save the login', async () => {
    const store = vi.fn(async () => undefined)
    vi.stubGlobal('PasswordCredential', class {
      constructor(public init: { id: string; password: string }) {}
    })
    Object.defineProperty(navigator, 'credentials', { value: { store }, configurable: true })
    const { onAuthenticated } = await toPasswordStep(true)
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'supersecret' } })
    submit()
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled())
    expect(store).toHaveBeenCalledWith(expect.objectContaining({ init: expect.objectContaining({ id: 'maya@example.test' }) }))
  })

  it('a failed sign-in offers nothing', async () => {
    const store = vi.fn(async () => undefined)
    vi.stubGlobal('PasswordCredential', class {})
    Object.defineProperty(navigator, 'credentials', { value: { store }, configurable: true })
    const d = deps({ signInWithPassword: vi.fn(async () => ({ data: null, error: { message: 'Wrong password' } })) })
    render(<EmailFirstSignup onAuthenticated={vi.fn()} deps={d} />)
    fireEvent.change(email(), { target: { value: 'maya@example.test' } })
    submit()
    await screen.findByTestId('password-form')
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'nope' } })
    submit()
    await screen.findByTestId('auth-error')
    expect(store).not.toHaveBeenCalled()
  })
})

describe('#332 — the last-used email, remembered on this device', () => {
  it('is pre-filled on the email-link sign-in, and stays editable', () => {
    localStorage.setItem(LAST_EMAIL_KEY, 'maya@example.test')
    render(<MagicLinkForm />)
    expect(email()).toHaveValue('maya@example.test')
    fireEvent.change(email(), { target: { value: 'other@example.test' } })
    expect(email()).toHaveValue('other@example.test')
  })

  it('is pre-filled on the password sign-in', () => {
    localStorage.setItem(LAST_EMAIL_KEY, 'maya@example.test')
    render(<EmailFirstSignup onAuthenticated={vi.fn()} deps={deps()} />)
    expect(email()).toHaveValue('maya@example.test')
  })

  it('is saved once a sign-in link is sent', async () => {
    render(<MagicLinkForm />)
    fireEvent.change(email(), { target: { value: ' maya@example.test ' } })
    submit()
    await screen.findByTestId('magic-sent-message')
    expect(localStorage.getItem(LAST_EMAIL_KEY)).toBe('maya@example.test')
  })

  it('is saved after a password sign-in', async () => {
    const { onAuthenticated } = await toPasswordStep(true)
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'supersecret' } })
    submit()
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled())
    expect(localStorage.getItem(LAST_EMAIL_KEY)).toBe('maya@example.test')
  })

  it('a page with no storage still works', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<MagicLinkForm />)
    expect(email()).toHaveValue('')
    vi.restoreAllMocks()
  })
})
