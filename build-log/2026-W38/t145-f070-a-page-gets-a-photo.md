# T145 (Issue #26) — a Page gets a photo

**Scenario:** F070 — every Page has a face. **Depends on:** T120 (upload
primitive), T123 (hide columns), T160 (the hide as every surface reads it).

## What was actually missing

Almost all of F070 was already on `main`, which the ticket status did not say:

- `039_media_bucket.sql` — the storage bucket and its policies.
- `groups.photo_url`, and T123's `photo_hidden_at` / `photo_hide_locked_url`.
- `lib/media/upload-image.ts` — resize, re-encode, put. **Zero callers.**
- `visiblePhotoUrl()`, `HiddenPhotoNotice`, and `ShopPublicPage` rendering both.
- `resolve-shop.ts` already selecting `photo_url` into `photoUrl`.

So the read path was finished and the write path did not exist. **Nothing in
the product could put a photo on a Page.** That is the whole of what this ships.

## What shipped

- **`group.update_draft` accepts `photoUrl`** — added to the Zod input and to
  the closed `GroupSpineSetClause` enum the conformance check reads as the
  injection-safety contract. `null` clears the column; `undefined` leaves it
  alone. That distinction is load-bearing: removing a photo and skipping the
  step are different acts, and a truthiness check would have made removal
  impossible.
- **`src/components/media/PagePhotoPicker.tsx`** — the first consumer of
  `uploadImage`. Owns the waiting, the failure and the removal; reports a URL
  or `null`, never a `File`. The bytes stop at the component, which is what
  lets one handler serve this composer and any later surface.
- **Wired into the About step** of `SellWalkthrough`, and shown on Review.
- **`sellUpdateDraftAction`** passes `photoUrl` through, `!== undefined` so an
  explicit clear survives the hop.

## Why the About step and not a seventh

F061 (#28) has an open question — the composer's six steps judged as a set,
which nobody has done. Adding a seventh step would have pre-empted Don's answer
in the PR that was meant to be about photos. The About step is already optional
and already persists on Continue, so the picker rides in it and **the composer
is still six steps.** If Don wants a dedicated photo step, that is F061's call
and this moves without changing the handler.

## The takedown half

Not in this ticket. The hide already works end to end — `report.create` hides
the photo, `visiblePhotoUrl()` withholds it, `HiddenPhotoNotice` explains it.
What is missing is the **operator review surface** (#12, the one
`launch-blocking` issue): there is no `src/app/admin/` route on `main`.
`[member-content-takedown]` gates photos reaching **production**, not building
them — so this is buildable and mergeable now, and #12 is what has to land
before a real member photo is served.

## No migration

`groups.photo_url` has existed since before T123. Nothing schema-side changed,
so the production apply workflow is not involved.

## Verification

TDD throughout — handler test red on three assertions before the schema and
SET-clause change, green after; picker test written before the component.

- `src/actions/group/update-draft.test.ts` — **new**, 7 tests. Writes, clears,
  leaves alone, rejects a non-URL, and refuses on a non-draft or unmanaged Page.
- `src/components/media/PagePhotoPicker.test.tsx` — **new**, 6 tests, including
  a failed upload that says so and does not trap the member, and recovery.
- Two existing `SellWalkthrough` assertions updated: the About step's
  `update_draft` call now carries `photoUrl: null`. They pinned the old
  argument shape; the new field is deliberate.
- `npx tsc --noEmit` clean. `npm run lint` 0 errors (29 pre-existing warnings).
- `npm run build` succeeds.
