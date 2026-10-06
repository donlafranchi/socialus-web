# change #411 — a Page's address is its id alone

- The PM, 2026-10-06 (socialus-plan planning/research/url-plan-2026-10-06.md): `canonicalPagePath` returns `/g/<id>`. Every older form (`/g/<name>-<id>`, `/g/<slug>`, `/p/<place>/g/<slug>`) permanently redirects to it.
- `groups.slug` is frozen: drafts no longer re-derive it on rename (live Pages never did), so item links that carry it keep resolving.
- Edit's Link note on a draft now shows the link it keeps ("It stays the same when you publish.").
- Guards: `page-handle.test.ts`, `resolve-page-address.test.ts`, `update-draft.test.ts` § #411.
