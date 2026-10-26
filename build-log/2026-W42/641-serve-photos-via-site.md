# #641 — photos served through the site, so Cloudflare's scan can see them

Cloudflare's CSAM Scanning Tool only checks images served through its cache, and member photos are served by Supabase Storage directly. The site now answers `/storage/v1/object/public/media/*` by rewriting to the same storage object, so a photo can be reached on socialus.org (and, once the zone is on Cloudflare, through its cache). `uploadImage` returns that address when `NEXT_PUBLIC_MEDIA_VIA_SITE=1` (off by default, set only after the tool is enabled); the path is unchanged, so `isOwnMediaUrl` and `mediaObjectPath` need no change. A severity 1 row says whether its photo was scanned (served from the site) or not (still on the storage host). Cloudflare gives no per-image result; a match is blocked and emailed.

Existing photos stay on the storage host until they are moved with a one-time update of the stored address (the PM's go, after the switch).
