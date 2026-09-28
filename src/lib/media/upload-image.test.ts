import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import piexif from 'piexifjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// T120 — the upload primitive. Real canvas work via @napi-rs/canvas (jsdom
// has no real 2D context or toBlob), so these tests exercise the actual
// resize/encode pipeline uploadImage runs in a browser, not a mock of it.
// Per F061 review binding note 2: "a test asserting that the resize function
// was called does not satisfy this criterion" — the EXIF test below inspects
// real output bytes.

// Safari's canvas cannot encode WebP: asked for image/webp, toBlob hands back a
// PNG and says so in blob.type. That is what reached the bucket (#232).
function installCanvasPolyfill({ webp = true }: { webp?: boolean } = {}) {
  const realCreateElement = document.createElement.bind(document)
  const createElementSpy = vi
    .spyOn(document, 'createElement')
    .mockImplementation((tag: string, ...rest: unknown[]) => {
      if (tag !== 'canvas') return realCreateElement(tag, ...(rest as []))
      let napi = createCanvas(1, 1)
      const fake = {
        get width() {
          return napi.width
        },
        set width(v: number) {
          napi = createCanvas(v, napi.height || 1)
        },
        get height() {
          return napi.height
        },
        set height(v: number) {
          napi = createCanvas(napi.width || 1, v)
        },
        getContext: (type: string) => {
          const ctx = napi.getContext(type as '2d')
          // The native canvas returns pixels from another realm; a browser's
          // are its own, which is what the WebP codec checks for.
          return new Proxy(ctx, {
            get(target, key) {
              if (key !== 'getImageData') {
                const v = Reflect.get(target, key)
                return typeof v === 'function' ? v.bind(target) : v
              }
              return (x: number, y: number, w: number, h: number) => {
                const img = target.getImageData(x, y, w, h)
                return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height }
              }
            },
            set: (target, key, value) => Reflect.set(target, key, value),
          })
        },
        toBlob: (cb: (b: Blob | null) => void, type?: string, quality?: number) => {
          const asked = (type ?? 'image/png') as 'image/png' | 'image/jpeg' | 'image/webp'
          const mime = asked === 'image/webp' && !webp ? 'image/png' : asked
          const buf = mime === 'image/png' ? napi.toBuffer('image/png') : napi.toBuffer(mime, quality)
          cb(new Blob([new Uint8Array(buf)], { type: mime }))
        },
      }
      return fake as unknown as HTMLCanvasElement
    })

  const bitmapStub = vi.fn(async (file: Blob) => {
    const buf = Buffer.from(await file.arrayBuffer())
    return (await loadImage(buf)) as unknown as ImageBitmap
  })
  vi.stubGlobal('createImageBitmap', bitmapStub)

  return { createElementSpy, bitmapStub }
}

function jpegWithGpsExif(width = 400, height = 300): Buffer {
  const c = createCanvas(width, height)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#3366ff'
  ctx.fillRect(0, 0, width, height)
  const jpegBuf = c.toBuffer('image/jpeg')

  const gpsIfd = {
    [piexif.GPSIFD.GPSLatitudeRef]: 'N',
    [piexif.GPSIFD.GPSLatitude]: [
      [38, 1],
      [35, 1],
      [0, 1],
    ],
    [piexif.GPSIFD.GPSLongitudeRef]: 'W',
    [piexif.GPSIFD.GPSLongitude]: [
      [121, 1],
      [29, 1],
      [0, 1],
    ],
  }
  const exifBytes = piexif.dump({ GPS: gpsIfd })
  const withExifBinary = piexif.insert(exifBytes, jpegBuf.toString('binary'))
  return Buffer.from(withExifBinary, 'binary')
}

function fileFromBuffer(buf: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(buf)], name, { type })
}

describe('resize + WebP re-encode (via upload-image internals)', () => {
  beforeEach(() => {
    installCanvasPolyfill()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('strips GPS EXIF from the stored bytes — byte-level, not a call-was-made assertion', async () => {
    const sourceBuf = jpegWithGpsExif()
    // Confirm the fixture really carries GPS before testing the strip —
    // otherwise a passing test proves nothing.
    const loaded = piexif.load(sourceBuf.toString('binary'))
    expect(loaded.GPS).toBeDefined()
    expect(loaded.GPS![piexif.GPSIFD.GPSLatitudeRef]).toBe('N')

    const { resizeAndEncode } = await import('./upload-image')
    const file = fileFromBuffer(sourceBuf, 'kitchen.jpg', 'image/jpeg')
    const outBlob = await resizeAndEncode(file)
    const outBuf = Buffer.from(await outBlob.arrayBuffer())

    expect(outBuf.toString('latin1')).not.toContain('Exif')
    expect(outBuf.slice(0, 4).toString('latin1')).toBe('RIFF')
    expect(outBuf.slice(8, 12).toString('latin1')).toBe('WEBP')
  })

  it('downscales an oversized image to a 1600px max edge, preserving aspect', async () => {
    const sourceBuf = jpegWithGpsExif(3200, 1600)
    const { resizeAndEncode } = await import('./upload-image')
    const file = fileFromBuffer(sourceBuf, 'big.jpg', 'image/jpeg')
    const outBlob = await resizeAndEncode(file)
    const outBuf = Buffer.from(await outBlob.arrayBuffer())
    const decoded = await loadImage(outBuf)
    expect(decoded.width).toBe(1600)
    expect(decoded.height).toBe(800)
  })

  it('does not upscale an image already smaller than the max edge', async () => {
    const sourceBuf = jpegWithGpsExif(200, 100)
    const { resizeAndEncode } = await import('./upload-image')
    const file = fileFromBuffer(sourceBuf, 'small.jpg', 'image/jpeg')
    const outBlob = await resizeAndEncode(file)
    const outBuf = Buffer.from(await outBlob.arrayBuffer())
    const decoded = await loadImage(outBuf)
    expect(decoded.width).toBe(200)
    expect(decoded.height).toBe(100)
  })

  it('still stores WebP when the browser canvas cannot encode it, as Safari cannot (#232)', async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    installCanvasPolyfill({ webp: false })
    // Node has no wasm loader for the codec's URL, so hand it the module the
    // browser would fetch. Same module instance the code under test imports.
    const codec = await import('@jsquash/webp/encode')
    await codec.init(
      await WebAssembly.compile(
        readFileSync(join(process.cwd(), 'node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm')),
      ),
    )

    const { resizeAndEncode } = await import('./upload-image')
    const file = fileFromBuffer(jpegWithGpsExif(), 'from-an-iphone.jpg', 'image/jpeg')
    const outBlob = await resizeAndEncode(file)
    const outBuf = Buffer.from(await outBlob.arrayBuffer())

    expect(outBlob.type).toBe('image/webp')
    expect(outBuf.slice(0, 4).toString('latin1')).toBe('RIFF')
    expect(outBuf.slice(8, 12).toString('latin1')).toBe('WEBP')
    expect(outBuf.toString('latin1')).not.toContain('Exif')
    const decoded = await loadImage(outBuf)
    expect(decoded.width).toBe(400)
  })

  it('throws a typed wrong-type error for an unreadable file, not a crash', async () => {
    const { resizeAndEncode, UploadError } = await import('./upload-image')
    const file = fileFromBuffer(Buffer.from('not an image'), 'nope.txt', 'text/plain')
    await expect(resizeAndEncode(file)).rejects.toBeInstanceOf(UploadError)
    await expect(resizeAndEncode(file)).rejects.toMatchObject({ code: 'wrong-type' })
  })
})

describe('uploadImage / deleteImage', () => {
  beforeEach(() => {
    installCanvasPolyfill()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('throws a typed too-large error for a source file well past any reasonable size, before ever touching the network', async () => {
    // This checks the pre-decode sanity cap (MAX_SOURCE_BYTES), not the
    // bucket's real 5MB limit — that one applies to the STORED, post-resize
    // object (see resizeAndEncode's own tests) and an ordinary phone photo
    // (often 8-15MB) must NOT be rejected here on its original size.
    const { uploadImage, UploadError } = await import('./upload-image')
    const absurd = new File([new Uint8Array(30 * 1024 * 1024)], 'huge.webp', { type: 'image/webp' })
    await expect(uploadImage(absurd, 'member-1')).rejects.toBeInstanceOf(UploadError)
    await expect(uploadImage(absurd, 'member-1')).rejects.toMatchObject({ code: 'too-large' })
  })

  it('does not reject a source file over the bucket limit but under the sanity cap — the real check is post-resize', async () => {
    // An 8MB original is a completely ordinary phone photo. It must not be
    // rejected on its pre-resize size — this is the regression this fix
    // exists to prevent.
    const sourceBuf = jpegWithGpsExif(2000, 1500)
    const padded = Buffer.concat([sourceBuf, Buffer.alloc(8 * 1024 * 1024 - sourceBuf.length)])
    const file = fileFromBuffer(padded, 'phone-photo.jpg', 'image/jpeg')
    const { uploadImage } = await import('./upload-image')
    // No supabase client is configured in this test env, so the network
    // call itself will fail — the point is that it gets there at all,
    // i.e. resizeAndEncode did not reject on the 8MB source size.
    await expect(uploadImage(file, 'member-1')).rejects.not.toMatchObject({ code: 'too-large' })
  })

  it("never hands the storage server's own words to the member (#232)", async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({
      createClient: () => ({
        storage: {
          from: () => ({
            upload: async () => ({ error: { message: 'mime type image/png is not supported' } }),
          }),
        },
      }),
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { uploadImage } = await import('./upload-image')
      const file = fileFromBuffer(jpegWithGpsExif(), 'a.jpg', 'image/jpeg')
      const err = await uploadImage(file, 'member-1').catch((e: Error) => e)
      expect(err).toMatchObject({ code: 'network' })
      expect((err as Error).message).not.toMatch(/mime|image\/png/)
    } finally {
      vi.doUnmock('@/lib/supabase')
      vi.resetModules()
    }
  })

  it('deleteImage is a no-op on a URL outside the media bucket', async () => {
    const { deleteImage } = await import('./upload-image')
    await expect(deleteImage('https://example.com/not-our-bucket/x.webp')).resolves.toBeUndefined()
  })
})
