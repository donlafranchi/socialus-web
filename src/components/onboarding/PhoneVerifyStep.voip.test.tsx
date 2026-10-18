// F081.9 through the real path: the phone screen → checkPhoneAction → Twilio Lookup (Line Type Intelligence) → only
// then Supabase sends the code. Mocked at the boundaries only: the Lookup HTTP call (fetch), the Supabase browser
// client that sends the code, and the server client that says who is signed in.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { COPY } from '@/lib/copy'

const h = vi.hoisted(() => ({ sendCode: vi.fn(), verifyOtp: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ auth: { updateUser: h.sendCode, verifyOtp: h.verifyOtp } }) }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))

import { PhoneVerifyStep } from './PhoneVerifyStep'

const lookup = vi.fn()
const lineType = (type: string) => () => Promise.resolve(new Response(JSON.stringify({ line_type_intelligence: { type } }), { status: 200 }))

beforeEach(() => {
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest')
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok')
  vi.stubGlobal('fetch', lookup)
  lookup.mockReset()
  h.sendCode.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function tryNumber(n: string) {
  fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: n } })
  fireEvent.click(screen.getByRole('button', { name: /text me a code/i }))
  await waitFor(() => expect(lookup).toHaveBeenCalled())
}

describe('F081.9 — a VoIP number is refused before any code is sent', () => {
  // [guards F081.9]
  it('a non-fixed VoIP number is looked up, refused with a plain ask for a mobile number, and sent no code; a mobile number is looked up first and then gets its code', async () => {
    render(<PhoneVerifyStep onVerified={vi.fn()} />)

    lookup.mockImplementation(lineType('nonFixedVoip'))
    await tryNumber('(916) 555-0134')
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.phoneVoip)
    expect(COPY.phoneVoip).toMatch(/mobile number/i)
    expect(String(lookup.mock.calls[0]![0])).toBe('https://lookups.twilio.com/v2/PhoneNumbers/%2B19165550134?Fields=line_type_intelligence')
    expect(h.sendCode).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/^code$/i)).toBeNull()

    lookup.mockReset().mockImplementation(lineType('mobile'))
    await tryNumber('(916) 555-0199')
    await waitFor(() => expect(h.sendCode).toHaveBeenCalledWith({ phone: '+19165550199' }))
    expect(lookup.mock.invocationCallOrder[0]!).toBeLessThan(h.sendCode.mock.invocationCallOrder[0]!)
    expect(await screen.findByLabelText(/^code$/i)).toBeInTheDocument()
  })

  it('a Lookup that is down or refuses lets the person through to their code (an outage never locks a real person out)', async () => {
    render(<PhoneVerifyStep onVerified={vi.fn()} />)
    lookup.mockImplementation(() => Promise.resolve(new Response('busy', { status: 503 })))
    await tryNumber('(916) 555-0134')
    await waitFor(() => expect(h.sendCode).toHaveBeenCalledWith({ phone: '+19165550134' }))
    cleanup()

    h.sendCode.mockClear()
    render(<PhoneVerifyStep onVerified={vi.fn()} />)
    lookup.mockReset().mockImplementation(() => Promise.reject(new Error('offline')))
    await tryNumber('(916) 555-0134')
    await waitFor(() => expect(h.sendCode).toHaveBeenCalledWith({ phone: '+19165550134' }))
  })
})
