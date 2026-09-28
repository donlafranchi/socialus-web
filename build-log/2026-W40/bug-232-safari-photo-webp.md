# A Page photo can be added from Safari

*2026-09-28. bug · #232.*

## What was wrong

Every photo is redrawn onto a canvas and re-encoded as WebP — the redraw is
the GPS strip. Safari's canvas cannot encode WebP; asked for it, `toBlob`
returns a PNG. Nothing checked, storage-js sent the Blob's own type, and the
WebP-only `media` bucket refused it. Don chose a JPEG and was told
*"mime type image/png is not supported"* — the storage server's words about
the converted output, passed through to him.

The input check, the allowlist and the detection were all fine.

## The fix

When the canvas returns anything but WebP, the already-stripped pixels are
encoded to WebP in the page with `@jsquash/webp` (Squoosh's libwebp build,
Apache-2.0). It is imported only on that path, so Chrome and Firefox never load
it. The bucket stays WebP-only, as policy.md § Uploaded images requires. A
failed upload no longer shows the storage server's message.

Allowing JPEG in the bucket was the other fix and is ruled out by that policy:
one accepted format is what forces every upload through the re-encode.

## How it was checked

Unit: a canvas that behaves as Safari's does — red before (`expected
'image/png' to be 'image/webp'`), green after, output bytes RIFF/WEBP with no
Exif. The error-message test is red before, green after.

Browser: the edit form in a local `next build` / `next start`, with
`toBlob('image/webp')` forced to return PNG. The upload that left the page was
`image/webp`, magic `RIFF…WEBP`, 26 KB from a 3000×2000 JPEG; the codec loaded
from `/_next/static/media/`. No CSP on www.socialus.org blocks WebAssembly.
Not tested on a real iPhone.
