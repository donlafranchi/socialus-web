### F102 (#488) criterion 13 — where a post or upload came from

- Every post and every stored Page/post photo records the member, what, the address (first hop of `x-forwarded-for`, else `x-real-ip`; null if neither is an address) and the time, in `content_origins`. RLS on with no policy: the action layer writes (`origin.record`), the operator reads over DATABASE_URL, no member reads it, and nothing outside the report path uses it.
- Recording is best-effort. A failure is logged and never undoes the post or the upload. The address is read in the server action; the action layer never touches headers.
- Deleted after one year by `public.purge_content_origins()`, run daily by `.github/workflows/content-origins-purge.yml`. The schedule waits for the repository variable `CONTENT_ORIGINS_PURGE_ENABLED=true`; a manual run always works.
- Migration `20261007280000_content_origins.sql`.
- **Privacy:** the privacy draft needs a line saying posts and uploads record the address they came from, kept a year for tracing abuse and legal requests (legal docs live outside this repo).
