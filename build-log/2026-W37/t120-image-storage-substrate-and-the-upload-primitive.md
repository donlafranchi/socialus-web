### T120 — Image storage substrate and the upload primitive

The `media` bucket (migration `039_media_bucket.sql`) and `src/lib/media/upload-image.ts` — one `uploadImage`/`deleteImage` module every future photo caller (T145 Page photos, T126's editor, Items when they resume) shares, so the EXIF-strip and bucket-restriction guarantees hold in exactly one place.

- **Named `media`, not `item-media`** — Pages are the first consumer per F061, Items the deferred second (review binding note 1).
- **Resize + WebP re-encode via canvas is the EXIF strip.** Longest edge capped at 1600px, no upscaling, quality 0.82 as a named constant. The re-encode is what removes GPS metadata, not a separate step.
- **Four RLS policies** on `storage.objects`, all scoped to `bucket_id = 'media'`: public SELECT, and INSERT/UPDATE/DELETE restricted to the uploader's own `{member_id}/` prefix via `storage.foldername`.

**M2 code review caught three real bugs, all fixed before commit:**
1. The size check ran against the *original* file (5MB) instead of the *post-resize stored* blob — would have rejected ordinary 8–15MB phone photos that resize to well under the real limit. Split into a generous 25MB pre-decode sanity cap and the real 5MB check on the encoded output.
2. `canvas.toBlob`'s callback had no timeout — a hang there (lost rendering context, constrained browser) would have left `uploadImage` waiting forever with no typed error, contradicting the ticket's own failure-surface requirement. Added a 15s timeout that converts silence into a typed `canvas-unavailable` error.
3. `deleteImage`'s path extraction didn't strip a query string or hash before matching — a cache-busted URL passed back to it would silently orphan the real object. Fixed to parse the URL properly first.

**Tests:** the byte-level EXIF test is real, not mocked — `@napi-rs/canvas` (devDependency, unimported under `src/`) patches jsdom's canvas so the actual resize/encode pipeline runs, and `piexifjs` builds a fixture JPEG with genuine GPS EXIF, confirmed present via `piexif.load` before the strip is asserted on the output bytes. 14 tests GREEN. The storage-API-level tests (bucket MIME/size rejection, cross-member RLS) are written and gated `describe.skipIf` to a local-only Supabase URL — same discipline as `tests/rls-coverage.test.ts` — but **did not run this session** (no Docker daemon available). Decision stub filed: `planning/backlog/decision-local-only-test-verification.md`.

**Deploy is not complete at merge.** Migration `039` must be applied to production by hand — `scripts/migration-conformance.sh` (T140) will flag it until then.

Most of this ticket's files are in the parent repo (`community-t140` worktree); this entry covers only the `web/package.json` `db:push` addition, which lands in this repo's own commit.

**Migration 039 confirmed applied** (PM pushed it) — `migration-conformance.sh` reports clean.
