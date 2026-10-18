import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// #927 — the emailed link carries the token itself, so it signs in in any browser; the code is the fallback.
const read = (n: string) => readFileSync(join(__dirname, '../../../supabase/templates', n), 'utf8')

describe.each([['magic-link.html', 'email'], ['confirmation.html', 'email'], ['recovery.html', 'recovery']])('%s', (file, type) => {
  const html = read(file)
  it('links with the token hash, not the PKCE confirmation URL', () => {
    expect(html).toContain(`{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=${type}`)
    expect(html).not.toContain('ConfirmationURL')
  })
  it('shows the six-digit code first, the link second', () => {
    expect(html.indexOf('{{ .Token }}')).toBeGreaterThan(-1)
    expect(html.indexOf('{{ .Token }}')).toBeLessThan(html.indexOf('token_hash'))
  })
})

describe('every caller gives the link a next, so the template can append to its query', () => {
  const hook = readFileSync(join(__dirname, '../../hooks/useAuth.ts'), 'utf8')
  it('the sign-up and magic-link emails always carry a destination', () => {
    expect(hook.match(/authRedirectUrl\(next \?\? '\/'\)/g)).toHaveLength(2) // sign-up and the magic link
  })
})
