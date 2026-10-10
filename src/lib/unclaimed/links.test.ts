import { describe, it, expect } from 'vitest'
import { checkLink } from './links'

const reply = (status: number) => async () => new Response('x', { status })

describe('checkLink (#556)', () => {
  it('passes a page that answers', async () => expect((await checkLink('https://a.example/', reply(200))).ok).toBe(true))
  it('fails a page that is gone', async () => expect((await checkLink('https://a.example/', reply(404))).ok).toBe(false))
  it('passes a site that turns robots away (a person still gets in)', async () => expect((await checkLink('https://a.example/', reply(403))).ok).toBe(true))
  it('fails a server error that stays', async () => expect((await checkLink('https://a.example/', reply(503))).ok).toBe(false))
  it('fails a certificate or network error', async () => {
    const down = async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } })
    }
    const v = await checkLink('https://a.example/', down)
    expect(v).toMatchObject({ ok: false, note: 'ERR_TLS_CERT_ALTNAME_INVALID' })
  })
  it('refuses anything that is not http(s)', async () => expect((await checkLink('javascript:alert(1)', reply(200))).ok).toBe(false))
})
