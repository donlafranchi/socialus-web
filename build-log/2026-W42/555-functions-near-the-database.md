# #555 — functions run beside the database

The nightly's slowest taps are all a Page's server render (5 s on production, 0.6 to 3 s from a laptop). Cause: the database is Supabase us-west-2 (Oregon) and the functions ran in Vercel's default region, iad1 (Virginia), so each sequential query paid a cross-country round trip. `vercel.json` now pins `regions: ["pdx1"]`.

Checked by `tests/vercel-region.test.ts` (red before). The shell, handoff and prefetch of #761 stay; this is the server half.
