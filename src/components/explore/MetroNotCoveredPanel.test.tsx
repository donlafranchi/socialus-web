// T168 (#194) — F076 criteria 13-15.
//
// What this file is really guarding: the signed-out branch used to be a dead
// end that sent a stranger to /auth/login, and the popup it leads to must
// carry NO NUMBER (#196). Both are things a well-meaning copy edit would undo.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const { getUser, joinAnonymous, join } = vi.hoisted(() => ({
  getUser: vi.fn(),
  joinAnonymous: vi.fn(),
  join: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getUser,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  }),
}))

vi.mock('@/app/_actions/metro-waitlist-actions', () => ({
  joinMetroWaitlistAction: join,
  joinMetroWaitlistAnonymousAction: joinAnonymous,
}))

import { MetroNotCoveredPanel } from './MetroNotCoveredPanel'

import type { FeedMetro } from '@/lib/feed/feed-metro'

const METRO: FeedMetro = {
  id: '22222222-2222-2222-2222-222222222222',
  slug: 'boise-city-id',
  name: 'Boise City, ID',
  isOpen: false,
}

// What `standingMessage` produces for a cached combined of 50 against 300.
const CONFIRMATION =
  'This metro needs 250 more people before there is enough here to be worth showing you.'

function renderPanel() {
  return render(<MetroNotCoveredPanel metro={METRO} onBack={() => {}} />)
}

const signedOut = () => getUser.mockResolvedValue({ data: { user: null } })
const signedIn = () => getUser.mockResolvedValue({ data: { user: { id: 'm1' } } })

beforeEach(() => {
  getUser.mockReset()
  joinAnonymous.mockReset()
  join.mockReset()
  joinAnonymous.mockResolvedValue({
    open: false,
    metroName: METRO.name,
    standing: { combined: 50, target: 300 },
    message: CONFIRMATION,
  })
  join.mockResolvedValue({
    open: false,
    metroName: METRO.name,
    standing: { combined: 50, target: 300 },
    message: 'This metro needs 250 more people before there is enough here to be worth showing you.',
  })
})
afterEach(cleanup)

describe('signed out — criterion 13, no account and no second step', () => {
  it('offers an email field instead of routing to sign-in', async () => {
    signedOut()
    renderPanel()
    expect(await screen.findByTestId('waitlist-email')).toBeInTheDocument()
    // The dead end this ticket replaces.
    expect(screen.queryByTestId('waitlist-signin')).not.toBeInTheDocument()
  })

  it('still offers signing up, as an option rather than the gate', async () => {
    signedOut()
    renderPanel()
    await screen.findByTestId('waitlist-email')
    expect(screen.getByTestId('waitlist-signin-alt')).toHaveAttribute(
      'href',
      expect.stringContaining('/auth/login'),
    )
  })

  it('asks for no password and no name', async () => {
    signedOut()
    const { container } = renderPanel()
    await screen.findByTestId('waitlist-email')
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument()
  })

  it('pre-selects neither role — criterion 3', async () => {
    signedOut()
    renderPanel()
    await screen.findByTestId('waitlist-email')
    expect(screen.getByTestId('waitlist-role-creator')).not.toBeChecked()
    expect(screen.getByTestId('waitlist-role-patron')).not.toBeChecked()
  })

  it('will not submit without both an address and a role', async () => {
    signedOut()
    renderPanel()
    const submit = await screen.findByTestId('waitlist-join')
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByTestId('waitlist-email'), { target: { value: 'a@b.com' } })
    expect(submit).toBeDisabled()

    fireEvent.click(screen.getByTestId('waitlist-role-patron'))
    expect(submit).toBeEnabled()
  })

  it('says what the address is for, and for nothing else — criterion 15', async () => {
    signedOut()
    renderPanel()
    await screen.findByTestId('waitlist-email')
    const purpose = screen.getByTestId('waitlist-email-purpose')
    expect(purpose.textContent).toMatch(/one message/i)
    expect(purpose.textContent).toMatch(/nothing else|only thing/i)
  })
})

describe('signed out — the popup carries the cached number (ruled 2026-09-23)', () => {
  const submit = async () => {
    signedOut()
    renderPanel()
    fireEvent.change(await screen.findByTestId('waitlist-email'), {
      target: { value: 'a@b.com' },
    })
    fireEvent.click(screen.getByTestId('waitlist-role-creator'))
    fireEvent.click(screen.getByTestId('waitlist-join'))
    return waitFor(() => screen.getByTestId('metro-standing-dialog'))
  }

  it('opens the same popup — not a page, not a new surface (criterion 7)', async () => {
    const dialog = await submit()
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(joinAnonymous).toHaveBeenCalledWith({
      metroId: METRO.id,
      email: 'a@b.com',
      role: 'creator',
    })
  })

  it('shows the cached count against the target', async () => {
    const dialog = await submit()
    expect(dialog.textContent).toContain('50')
    expect(dialog.textContent).toContain('300')
  })

  it('renders no number when the action had none to give', async () => {
    // Null standing, not zero — a metro missing from the cached snapshot.
    joinAnonymous.mockResolvedValue({
      open: false,
      metroName: METRO.name,
      standing: null,
      message: '',
    })
    const dialog = await submit()
    expect(dialog.textContent ?? '').not.toMatch(/\d/)
  })

  it('never calls the signed-in action, which would return a count', async () => {
    await submit()
    expect(join).not.toHaveBeenCalled()
  })
})

describe('signed in — unchanged, and still sees its number', () => {
  it('keeps the role radios and no email field', async () => {
    signedIn()
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('waitlist-join')).toBeInTheDocument())
    // The join button shows before the session resolves; wait for the email field to go.
    await waitFor(() => expect(screen.queryByTestId('waitlist-email')).not.toBeInTheDocument())
  })

  it('still shows the combined count a member is entitled to see', async () => {
    signedIn()
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('waitlist-join')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('waitlist-role-creator'))
    fireEvent.click(screen.getByTestId('waitlist-join'))
    const dialog = await waitFor(() => screen.getByTestId('metro-standing-dialog'))
    expect(dialog.textContent).toContain('50')
    expect(dialog.textContent).toContain('300')
    expect(joinAnonymous).not.toHaveBeenCalled()
  })
})

describe('the confirmation says nothing it must not', () => {
  it('promises no date, no timeline, and no opening — criterion 9', async () => {
    signedOut()
    renderPanel()
    fireEvent.change(await screen.findByTestId('waitlist-email'), {
      target: { value: 'a@b.com' },
    })
    fireEvent.click(screen.getByTestId('waitlist-role-patron'))
    fireEvent.click(screen.getByTestId('waitlist-join'))
    const dialog = await waitFor(() => screen.getByTestId('metro-standing-dialog'))
    expect(dialog.textContent ?? '').not.toMatch(
      /soon|next (week|month|year)|shortly|coming|guarantee|will open/i,
    )
  })

  it('shows only what the action returned — nothing derived from whether the row was new', async () => {
    // The surface half of criterion 14. The action returns the same words for
    // a new address and a known one, so the only way the popup could differ is
    // if this component added something of its own. It renders the metro name,
    // the message, and the button — and this pins that set.
    signedOut()
    renderPanel()
    fireEvent.change(await screen.findByTestId('waitlist-email'), {
      target: { value: 'a@b.com' },
    })
    fireEvent.click(screen.getByTestId('waitlist-role-patron'))
    fireEvent.click(screen.getByTestId('waitlist-join'))
    const dialog = await waitFor(() => screen.getByTestId('metro-standing-dialog'))

    expect(dialog.textContent).toBe(`${METRO.name}50 of 300${CONFIRMATION}Got it`)
    // And the confirmation line behind it says nothing conditional either.
    expect(screen.getByTestId('waitlist-joined').textContent).not.toMatch(
      /already|again|previously|still/i,
    )
  })
})

describe('failure', () => {
  it('reports a refusal without saying whether the address was known', async () => {
    signedOut()
    joinAnonymous.mockRejectedValue(new Error('That does not look like an email address.'))
    renderPanel()
    fireEvent.change(await screen.findByTestId('waitlist-email'), {
      target: { value: 'nope' },
    })
    fireEvent.click(screen.getByTestId('waitlist-role-patron'))
    fireEvent.click(screen.getByTestId('waitlist-join'))
    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).not.toMatch(/already|exists|known|listed/i)
  })
})
