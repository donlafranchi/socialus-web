import { describe, it, expect, vi } from 'vitest'
import { resolvePageContact } from './page-contact'

const supabaseWith = (row: unknown) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: vi.fn(async () => ({ data: row, error: null })) }) }) }) }) as never

describe('#293 / Don 2026-10-04 — a group shows hours and phone only once added', () => {
  const filled = { contact_phone: '+19165550142', opening_hours: { mon: [{ open: '07:00', close: '15:00' }] } }
  it('a shop shows them', async () => {
    expect(await resolvePageContact(supabaseWith({ kind: 'business', metadata: {}, ...filled }), 'g')).toEqual(
      expect.objectContaining({ phone: '+19165550142' }),
    )
  })
  it('a group does not, even with hours on file', async () => {
    expect(await resolvePageContact(supabaseWith({ kind: 'interest', metadata: {}, ...filled }), 'g')).toBeNull()
  })
  it('a group whose owner added them does', async () => {
    expect(await resolvePageContact(supabaseWith({ kind: 'interest', metadata: { components: { contact: true } }, ...filled }), 'g')).not.toBeNull()
  })
})
