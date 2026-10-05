// F081 — the text-message code at signup (Don, 2026-10-01).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PhoneVerifyStep, type PhoneAuth } from './PhoneVerifyStep'

afterEach(cleanup)

const auth = (over: Partial<PhoneAuth> = {}): PhoneAuth => ({
  sendCode: vi.fn(async () => ({ ok: true as const })),
  verifyCode: vi.fn(async () => ({ ok: true as const })),
  ...over,
})

const typePhone = (v: string) => fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: v } })
const typeCode = (v: string) => fireEvent.change(screen.getByLabelText(/code/i), { target: { value: v } })

describe('F081 — verifying a phone at signup', () => {
  it('texts a code to the number, written as E.164', async () => {
    const a = auth()
    render(<PhoneVerifyStep auth={a} onVerified={vi.fn()} />)
    typePhone('(916) 555-0134')
    fireEvent.click(screen.getByRole('button', { name: /text me a code/i }))
    await waitFor(() => expect(a.sendCode).toHaveBeenCalledWith('+19165550134'))
    expect(await screen.findByLabelText(/code/i)).toBeInTheDocument()
  })

  it('refuses a number that is not a US phone, without texting', async () => {
    const a = auth()
    render(<PhoneVerifyStep auth={a} onVerified={vi.fn()} />)
    typePhone('555-0134')
    fireEvent.click(screen.getByRole('button', { name: /text me a code/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/us phone number/i)
    expect(a.sendCode).not.toHaveBeenCalled()
  })

  it('verifies the code against the same number and moves on', async () => {
    const a = auth()
    const onVerified = vi.fn()
    render(<PhoneVerifyStep auth={a} onVerified={onVerified} />)
    typePhone('9165550134')
    fireEvent.click(screen.getByRole('button', { name: /text me a code/i }))
    await screen.findByLabelText(/code/i)
    typeCode('123456')
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    await waitFor(() => expect(a.verifyCode).toHaveBeenCalledWith('+19165550134', '123456'))
    await waitFor(() => expect(onVerified).toHaveBeenCalled())
  })

  it('a wrong code says so and does not move on', async () => {
    const a = auth({ verifyCode: vi.fn(async () => ({ ok: false as const, message: 'Token has expired or is invalid' })) })
    const onVerified = vi.fn()
    render(<PhoneVerifyStep auth={a} onVerified={onVerified} />)
    typePhone('9165550134')
    fireEvent.click(screen.getByRole('button', { name: /text me a code/i }))
    await screen.findByLabelText(/code/i)
    typeCode('000000')
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn.t match/i)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('a failed send says so and stays on the number', async () => {
    const a = auth({ sendCode: vi.fn(async () => ({ ok: false as const, message: 'Unable to send' })) })
    render(<PhoneVerifyStep auth={a} onVerified={vi.fn()} />)
    typePhone('9165550134')
    fireEvent.click(screen.getByRole('button', { name: /text me a code/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t send/i)
    expect(screen.queryByLabelText(/code/i)).toBeNull()
  })
})
