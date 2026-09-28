### bug #232 — A Page photo from Safari is encoded as WebP in the page

**Don picked a JPEG and was told "mime type image/png is not supported."** Safari's canvas cannot encode WebP; asked for `image/webp`, `toBlob` returns a PNG without saying so. `resizeAndEncode` passed it on, and the WebP-only `media` bucket refused it. The PNG in the message was our converted output, not his file.

**Now:** when the canvas hands back anything but WebP, the already-stripped pixels are encoded with `@jsquash/webp` in the page. The codec is dynamically imported, so only browsers that need it load it. The bucket stays WebP-only. A failed upload no longer passes the storage server's text to the member; it's logged and the member reads "it didn't reach our storage".

Tests: 2 new in `upload-image.test.ts` (a Safari-shaped canvas still yields WebP, via the real codec; the storage error text never reaches the member), both seen failing against the old encoder. **No migration.**
