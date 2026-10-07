# change #411 — a Page's address is its id alone

- The PM, 2026-10-06 (socialus-plan planning/research/url-plan-2026-10-06.md, amended the same day): `/g/<id>` is the only Page route. `resolvePageById` serves only an id as minted; `/g/<name>-<id>`, `/g/<slug>`, `/p/<place>/g/<slug>` and `/manage/<slug>` are not forwarded and are not found, while there are no members or shared links to protect. Revisit forwarding once real members exist.
- No slug freeze and no migration: the slug no longer appears in any Page address.
- Edit's Link note on a draft shows the link it keeps ("It stays the same when you publish.").
- Guards: `page-handle.test.ts`, `resolve-page-address.test.ts`.
