# Infrastructure

Every external service SocialUs depends on, when it becomes required, and the
cheapest adequate provider for each.

Launch target: **2026-10-30**, one metro.

Each section below carries a **Wire-up** block: enough concrete detail to hand
straight to an implementing agent without re-deriving it. Classify the ticket by
`ops-pattern/PIPELINE.md` before opening it; the suggested kind is noted per item.

## How to read the table

Columns are the four stages, in order. A service is required from the first
stage that marks it and stays required after that.

| Stage | Meaning |
|---|---|
| **Local** | `npm run dev` against `supabase start` on localhost |
| **Preview** | Vercel preview deploys against the remote Supabase project |
| **Launch** | Production, 2026-10-30, real users in one metro |
| **Scale** | Past the first metro, or past a free tier's ceiling |

| Mark | Meaning |
|---|---|
| ● | Required at this stage |
| ○ | Optional, real benefit if present |
| · | Not needed yet |

---

## What we need

| # | Need | Local | Preview | Launch | Scale | Why |
|---|---|:---:|:---:|:---:|:---:|---|
| 1 | Hosting and CDN | · | ● | ● | ● | [→](#1-hosting-and-cdn) |
| 2 | Database and Auth | ● | ● | ● | ● | [→](#2-database-and-auth) |
| 3 | Image storage | ● | ● | ● | ● | [→](#3-image-storage) |
| 4 | Maps and geocoding | ● | ● | ● | ● | [→](#4-maps-and-geocoding) |
| 5 | Domain and DNS | · | · | ● | ● | [→](#5-domain-and-dns) |
| 6 | Transactional email | ○ | ● | ● | ● | [→](#6-transactional-email) |
| 7 | Scheduled jobs | · | ○ | ● | ● | [→](#7-scheduled-jobs) |
| 8 | Signup abuse defense | · | ○ | ● | ● | [→](#8-signup-abuse-defense) |
| 9 | Content moderation | · | · | ● | ● | [→](#9-content-moderation) |
| 10 | Backups | · | · | ● | ● | [→](#10-backups) |
| 11 | Error tracking | · | ○ | ● | ● | [→](#11-error-tracking) |
| 12 | Uptime monitoring | · | · | ● | ● | [→](#12-uptime-monitoring) |
| 13 | Product analytics | · | ○ | ● | ● | [→](#13-product-analytics) |
| 14 | Edge protection | · | · | ○ | ● | [→](#14-edge-protection) |
| 15 | Payments | · | · | · | ○ | [→](#15-payments) |
| 16 | Push notifications | · | · | · | ○ | [→](#16-push-notifications) |

Nine of the sixteen are required at Launch and not before. Six of those nine
cost nothing.

### Cost by stage

| Stage | Monthly |
|---|---|
| Local | $0 |
| Preview | $0 |
| Launch | ~$48 |
| Scale | Usage-driven, watch items 4, 6 and 1 |

### Dispatch order

Items 6, 11, 13 and 8 touch application code and should land before the
plan upgrades, since they are testable on free tiers. Items 1 and 2 are account
changes with no code. Item 9 is blocked on a scenario.

| Order | Item | Kind | Blocked on |
|---|---|---|---|
| 1 | 6 Transactional email | chore | Domain DNS access |
| 2 | 11 Error tracking | chore | Nothing |
| 3 | 13 Product analytics | change | Event names agreed |
| 4 | 8 Turnstile | change | Nothing |
| 5 | 10 Backups | chore | Nothing |
| 6 | 7 Scheduled jobs | chore | Item 10 defines the first job |
| 7 | 12 Uptime monitoring | chore | Production domain live |
| 8 | 9 Content moderation | **scenario** | `ops-pattern` approval |
| 9 | 1, 2 Plan upgrades | chore | Two weeks before launch |

---

## Why we need each

### 1. Hosting and CDN

**What it is.** Serves the Next.js app, terminates SSL, runs server actions and
route handlers, caches static assets at the edge.

**Who provides it.** Vercel. Free (Hobby) through Preview.

**When you outgrow it.** At Launch, not on capacity but on terms: Hobby
prohibits commercial use, and a buy/sell/trade marketplace is not defensibly
non-commercial once money moves. Pro is **$20/month per member**, so a second
collaborator doubles the line. Pro also lifts cron limits (item 7) and log
retention from about an hour to days, which matters the first morning someone
reports a bug from the night before.

**Wire-up.** No code. Dashboard only.

| Setting | Value |
|---|---|
| Framework preset | Next.js (auto-detected) |
| Root directory | `.` |
| Build command | `npm run build` |
| Output directory | `.next` |
| Install command | `npm install` |
| Node version | 20.x |

Upgrade path: Settings > General > Plan. After upgrading, set a spend alert
under Settings > Billing at $60.

**Verify.** A production deploy succeeds and the deployment log retains more
than one hour of history.

---

### 2. Database and Auth

**What it is.** Postgres, row-level security, magic-link auth, Realtime.
The whole data layer.

**Who provides it.** Supabase. Free tier through Preview.

**When you outgrow it.** At Launch, on three counts, none of them database size:

| Free limit | Why it bites |
|---|---|
| Pauses after 7 idle days | A quiet week takes production down |
| No backups at all | One bad migration is total loss |
| 5 GB storage egress | About 30k photo views, one good week |

Pro is **$25/month per org** and includes a $10 compute credit covering the
Micro instance. 8 GB database and 100k MAU come with it and are both far past
what one metro needs.

**Wire-up.** Dashboard, plus env vars.

1. Project Settings > API. Copy Project URL, publishable key
   (`sb_publishable_...`, client-safe) and secret key (`sb_secret_...`,
   server-only, bypasses RLS).
2. Authentication > URL Configuration. Site URL is the canonical origin.
   Redirect URLs must include `https://<domain>/auth/callback` and
   `http://localhost:3000/**`.
3. Authentication > Providers. Email is on by default. Enable email confirmation
   under Authentication > Settings.
4. Settings > Billing. Upgrade to Pro, then **turn the spend cap on**. With it
   off, overage bills silently.

`NEXT_PUBLIC_SITE_URL` drives magic-link `redirectTo`, OG tags and QR codes via
`src/lib/site-url.ts`. Leave it unset locally so the client falls back to
`window.location.origin` and links land on `localhost:3000`.

**Optional add-on.** Auth custom domain, $10/month. Without it auth links carry
a `*.supabase.co` host. That is a trust cost on a marketplace, not a technical
one. Defer until someone complains.

**Verify.** `supabase migration list` shows the remote matching local, and a
magic link from production lands on the production `/auth/callback`.

---

### 3. Image storage

**What it is.** Somewhere to put uploaded photos. Already built: bucket `media`,
created by `supabase/migrations/039_media_bucket.sql`.

**Who provides it.** Supabase Storage. No separate service, no Cloudinary, no S3.

**Why it needs nothing more.** `src/lib/media/upload-image.ts` resizes to a
1600px longest edge and re-encodes to WebP in the browser before upload. At
roughly 150 KB per photo, the free 1 GB already holds about 6,000. The bucket
accepts `image/webp` only, and the canvas re-encode is what strips EXIF and GPS.

**Wire-up.** Nothing to do. This item is on the table because it is a dependency
worth knowing about, not because it is outstanding.

Constraints an implementing agent must respect:

| Constraint | Where | Consequence of breaking it |
|---|---|---|
| WebP only, 5 MB stored ceiling | Bucket `allowed_mime_types` | Upload rejected at the API |
| Canvas re-encode is the EXIF strip | `upload-image.ts` | Swapping in a metadata-preserving library leaks GPS and breaks `policy.md` § Uploaded images |
| Path is member-id first | RLS policy via `storage.foldername(name)` | Write policy stops being expressible |
| Bucket is `public: true` | Migration 039 | See item 9 |

**When you outgrow it.** Egress before capacity, which is item 2's Pro upgrade.
Supabase image transformations are Pro-only and you do not need them, because
the resize already happened client-side.

---

### 4. Maps and geocoding

**What it is.** Map tiles for the discovery surface, plus server-side reverse
geocoding (T059).

**Who provides it.** Mapbox. Free tier is 50,000 map loads/month, then about
$5 per 1,000.

**When you outgrow it.** This is the only line neither paid upgrade touches, and
a map-first product reaches it before it reaches anything else.

**Wire-up.** Two tokens, deliberately separate.

1. Account > Access tokens > Create a token. Name
   `socialus-prod`, scopes `styles:tiles`, `styles:read`, `fonts:read`,
   `datasets:read`. Add a URL restriction for the production domain. This is
   `NEXT_PUBLIC_MAPBOX_TOKEN`, and it ships to the browser.
2. A second token with geocoding scope and no URL restriction, since it is
   called server-side. This is `MAPBOX_GEOCODING_TOKEN`. Never expose it.

**Monitor.** [account.mapbox.com/statistics](https://account.mapbox.com) weekly
after launch.

**Cheaper at scale.** MapLibre GL with OpenFreeMap or Protomaps tiles removes
the per-load cost entirely. `mapbox-gl` and `maplibre-gl` are close enough in
API that the swap is contained to the map component and the `@types/mapbox-gl`
import. For geocoding, Nominatim is free but its usage policy rules out bulk
calls. Treat the swap as a change ticket, sized in a day, triggered by the 50k
ceiling and not before.

---

### 5. Domain and DNS

**What it is.** The canonical origin, SSL, and a mailbox a human can reply from.

**Who provides it.** Hover, already owned. Vercel issues SSL automatically.

**Wire-up.** In Vercel, Settings > Domains > Add. Then at Hover:

```
Type    Name    Value
CNAME   @       cname.vercel-dns.com
CNAME   www     cname.vercel-dns.com
```

Item 6 adds DKIM, SPF and DMARC records at the same registrar. Do both DNS
changes in one sitting to avoid two propagation waits.

**When you outgrow it.** You do not. Cloudflare free is an option later if you
want DNS-level rules, but Vercel already covers CDN and certificates.

---

### 6. Transactional email

**What it is.** The sender behind magic links, and behind follow notifications
(T018).

**Who provides it.** Resend free tier: 3,000/month, **100/day**. The daily cap
binds first, and 100 magic links is a real launch day in one metro.

**Why it is required before Launch, not at Launch.** Supabase's built-in sender
is capped at roughly two per hour and is documented as not-for-production. This
does not change on Pro. Because auth is magic-link, that cap is the front door:
two people signing in within the same hour is enough for the second to fail with
no visible error. Test it at Preview or you will discover it on launch day.

**Wire-up.** Two jobs that people routinely conflate. Doing only the second
leaves login broken.

**6a. Resend as Supabase custom SMTP.** This is what fixes auth email.

1. Resend > Domains > Add Domain, `socialus.org`. Copy the DKIM, SPF and
   DMARC records it generates into Hover DNS. Wait for Verified.
2. Resend > API Keys > Create. Value starts `re_`. This is `RESEND_API_KEY`.
3. Supabase > Project Settings > Authentication > SMTP Settings. Enable custom
   SMTP:

   | Field | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the `re_...` API key |
   | Sender email | an address on the verified domain |

4. Supabase > Authentication > Rate Limits. The built-in per-hour email cap
   stays in force until raised here. Raising it is the point of the exercise, so
   do not skip it.

**6b. App sends for follow notifications (T018).**

```bash
npm install resend
```

Server-side only. Reads `RESEND_API_KEY` and `FOLLOW_EMAIL_FROM`, which can
stay on `onboarding@resend.dev` until 6a's domain verifies. The send belongs
behind the action layer, not in a component; check
`scripts/check-action-layer-conformance.ts` for the boundary this repo enforces.

**Do not** point Supabase SMTP at the Hover mailbox. That mailbox is for humans
replying, and app volume through it risks the domain's reputation.

**Verify.** Request two magic links from different addresses within one minute.
Both arrive. Before 6a, the second does not.

**Cheaper at scale.** AWS SES at $0.10 per 1,000 is the floor, with a 24-hour
approval and bounce handling you write yourself. Brevo's 300/day free tier beats
Resend's if the daily cap is what pinches. Switch when 100/day binds, not before.

---

### 7. Scheduled jobs

**What it is.** Whatever runs on a timer: the backup dump (item 10), digest
sends, cleanup.

**Who provides it.** GitHub Actions scheduled workflows, free and unrestricted
on frequency. Vercel Cron is the alternative but Hobby caps at two jobs at daily
frequency, and Pro lifts that to unlimited.

**Current state.** `CRON_SECRET` is declared in `.env.local.example`, there is
no `vercel.json`, and nothing is scheduled.

**Wire-up.** Choose by what the job touches.

**GitHub Actions**, for jobs that hit the database directly and need
`DATABASE_URL` rather than a web request:

```yaml
# .github/workflows/<job>.yml
on:
  schedule:
    - cron: '0 7 * * *'   # UTC, always
  workflow_dispatch:       # keep, so it is testable without waiting
```

Secrets live in repo Settings > Secrets and variables > Actions.

**Vercel Cron**, for jobs that must run inside the app's request context:

```json
// vercel.json
{ "crons": [{ "path": "/api/internal/<job>", "schedule": "0 7 * * *" }] }
```

The handler must reject anything without `Authorization: Bearer ${CRON_SECRET}`
before doing work. Generate the secret with `openssl rand -hex 32`. Follow the
signature-verification shape already in
`src/app/api/internal/auth-before-user-created/route.ts` rather than inventing a
second pattern.

**Verify.** `workflow_dispatch` runs green, and the Vercel route returns 401
without the Bearer token.

---

### 8. Signup abuse defense

**What it is.** Stopping account farming before the `auth.users` row is written.

**Who provides it.** Mostly this repo, already.
`src/app/api/internal/auth-before-user-created/route.ts` implements the Supabase
before-user-created hook, with a built-in disposable-domain list plus
`SIGNUP_BLOCKED_EMAIL_DOMAINS` and `SIGNUP_ALLOWED_EMAIL_DOMAINS`.

**What is missing.** A CAPTCHA in front of it. Cloudflare Turnstile is free and
unlimited, and Supabase Auth supports it natively, so it slots ahead of the
hooks you already wrote without touching them.

**Wire-up, existing hook.** Supabase > Authentication > Hooks. Point
before-user-created at
`https://<domain>/api/internal/auth-before-user-created`, then paste the
generated secret into `AUTH_BEFORE_USER_CREATED_HOOK_SECRET` **verbatim,
including the `v1,whsec_` prefix**. During rotation, list two secrets separated
by `|`.

**Wire-up, Turnstile.**

1. Cloudflare dashboard > Turnstile > Add site. Returns a site key (public) and
   a secret key. Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the env example and to
   Vercel.
2. Supabase > Authentication > Settings > Bot and Abuse Protection. Enable
   CAPTCHA, provider Turnstile, paste the **secret** key. Supabase verifies the
   token server-side, so the app never calls Cloudflare directly.
3. Client: render the widget on the signup form and pass its token through:

   ```ts
   supabase.auth.signInWithOtp({ email, options: { captchaToken } })
   ```

   Load the widget script from `challenges.cloudflare.com`. It is a client
   component, so it needs the `'use client'` boundary the rest of the auth form
   already sits behind.

**Verify.** A signup with no `captchaToken` is rejected by Supabase, not by the
client. Test by calling `signInWithOtp` without the option.

---

### 9. Content moderation

**What it is.** A path for removing an illegal or abusive upload, and a record
that you did.

**Who provides it.** Nobody on this list, at any price. There is no adequate
free service.

**Why it is required at Launch.** Public photo uploads in a marketplace reach
this eventually, and item 3's public-read bucket means an object is
world-readable before any human sees it. The free answer is product work: a
report control, a review queue, and the ability to delete an object and the row
pointing at it.

**This is a scenario, not a chore.** It changes behavior and needs acceptance
checks, so per `CLAUDE.md` it goes to `ops-pattern` for a scenario before any
ticket opens here. Do not let it arrive as a `change ·` ticket.

**What the scenario needs to decide**, so `ops-pattern` has something to work
with:

| Question | Why it is load-bearing |
|---|---|
| Who can report, anonymous or members only? | Decides whether the report table needs RLS for anon inserts |
| What happens on report: immediate hide, or queue only? | Immediate hide needs a visibility flag the feed's materialized view respects |
| Who reviews, and where? | An admin surface, or `ADMIN_EMAILS` gating an existing page |
| Does removal delete the object or orphan it? | Deletion is irreversible and interacts with item 10 |
| Is there an appeal? | Decides whether removal is a state or a delete |

**Prior art in the repo.** `ADMIN_EMAILS` already gates UI, and the event-log
rows seeded by `the-good-place.sql` suggest where an audit trail would live.

---

### 10. Backups

**What it is.** A copy of the database, and of the `media` bucket, that survives
a bad migration or a lost account.

**Who provides it.** Two layers, and you want both.

| Layer | Covers | Cost |
|---|---|---|
| Supabase Pro daily snapshot | Postgres, 7-day retention | Included in item 2 |
| Nightly `pg_dump` on GitHub Actions | Postgres, retention you choose | $0 |

**Why both.** The Pro snapshot is a snapshot, not a rewind: corruption at 2pm
rolls back to midnight. Point-in-time recovery is a **$100/month** add-on, four
times the price of the plan it sits on, and not worth it at this stage. Your own
dump additionally survives losing the Supabase account, which their backup
cannot, and outlives the 7-day window.

**Open question, resolve before relying on either.** Confirm against current
Supabase docs whether the daily backup covers Storage objects or only Postgres.
If Storage is excluded, add the `media` bucket to the same nightly job. The
difference is whether a restore gives you working photos or broken images.

**Wire-up.** A GitHub Actions job on the item 7 pattern.

```bash
pg_dump "$DATABASE_URL" --no-owner --no-privileges -Fc -f dump.pgc
```

Details that cause failures if missed:

- **Client version must be at least the server's.** The runner's default
  `postgresql-client` is usually older than Supabase's Postgres and `pg_dump`
  refuses to run against a newer server. Pin the client version explicitly in
  the workflow.
- **Use the pooler-free connection string** for dumps, **and only for dumps**.
  Session pooling and `pg_dump` interact badly. Take the direct connection
  string from Supabase > Project Settings > Database. **This is not advice for
  the app** — `DATABASE_URL` in Vercel must be the pooler URL, because the
  direct host has no A record and Vercel is IPv4-only. See § Environment
  variables.
- **`--no-owner --no-privileges`** so the dump restores into a fresh project
  without role errors.
- **Storage objects** are not in `pg_dump`. The Supabase CLI can mirror a bucket
  (`supabase storage cp -r ss:///media ./media --experimental`); confirm the flag
  is still current before depending on it.

**Destination.** A private repo works. Backblaze B2 gives 10 GB free and is a
better fit once dumps get large.

**Verify, and this is the part people skip.** Restore one dump into a scratch
Supabase project and load the app against it. A backup you have never restored
is a hypothesis.

---

### 11. Error tracking

**What it is.** Notification that a server action threw, with a stack trace,
before a user thinks to tell you.

**Who provides it.** Sentry free tier, 5,000 errors/month.

**Wire-up.** The one item here that is real code rather than a URL.

```bash
npx @sentry/wizard@latest -i nextjs
```

The wizard creates the client, server and edge configs plus
`instrumentation.ts`, and wraps `next.config.ts`. Two cautions:

- This repo is on **Next.js 16**, and the wizard has historically lagged major
  Next releases. If it fails or produces a config that does not build, fall back
  to manual setup from Sentry's Next.js docs rather than downgrading Next.
- The wizard offers to enable session replay. Decline it. It is a separate quota
  and item 13 answers the questions you actually have.

Env vars it introduces: `NEXT_PUBLIC_SENTRY_DSN`, and `SENTRY_AUTH_TOKEN` for
source map upload at build time. Add both to Vercel and to
`.env.local.example`.

**Verify.** Throw deliberately from a server action in a preview deploy and
confirm the trace arrives with readable source maps, not minified frames.

---

### 12. Uptime monitoring

**What it is.** A synthetic check from outside your infrastructure, confirming a
real page loads.

**Who provides it.** UptimeRobot free tier, 50 monitors at 5-minute intervals.

**Why Vercel and Supabase do not cover it.** Both report on themselves. Neither
tells you the signup form throws on submit while both status pages stay green.

**Wire-up.** No code. Create a **keyword** monitor, not a plain HTTP one: point
it at a page that renders database-backed content and have it check for a string
that only appears when that query succeeded. An HTTP 200 monitor stays green
while the page renders an error state.

Add a second monitor on `/auth` or whichever route the login form lives at,
since that is the path whose failure costs you the most.

**Note.** On the Supabase free tier this also served as the keep-alive against
the 7-day pause. After item 2's Pro upgrade that purpose disappears, but the
monitoring reason stands on its own.

---

### 13. Product analytics

**What it is.** Which of buy, sell, trade and gather people actually return for.

**Who provides it.** PostHog Cloud free tier, 1M events/month.

**Why not Vercel Web Analytics.** Pro includes roughly 25k events/month of
page-level counts. Finding a market is a question about funnels and retention,
and pageviews cannot answer it.

**Wire-up.**

```bash
npm install posthog-js
```

Env: `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`
(`https://us.i.posthog.com`, or the EU host if you pick that region; choose
before launch, since it is not switchable later without losing history).

Initialize in a client provider mounted in the root layout. In the App Router,
autocapture does not record client-side route changes on its own, so capture
`$pageview` manually on pathname change.

**The part that matters more than the install.** Agree the event names before
writing them, because renaming later orphans the history:

| Event | Fires when |
|---|---|
| `item_created` | A member posts an item, property for its one category |
| `item_viewed` | An item detail page renders |
| `contact_initiated` | A member reaches out about an item |
| `group_joined` | A membership row is created |
| `page_followed` | The T018 follow that triggers item 6's email |

Instrument these **before** launch. Retrofitting analytics onto a live product
costs you the first cohort, which is the one cohort whose behavior you most need.

**Privacy.** Disable session recording and set `person_profiles: 'identified_only'`.
A marketplace holding location data should not also be shipping full session
replays to a third party.

---

### 14. Edge protection

**What it is.** Filtering volumetric and bot traffic before it reaches a
function.

**Who provides it.** Vercel Firewall, with custom rules on Pro. Included in
item 1's upgrade, so there is nothing extra to buy.

**Wire-up.** Dashboard only, Firewall tab. Worth adding once live: a rate limit
on `/api/internal/*` and on the auth routes. Attack Challenge Mode is the
emergency lever, not a default.

**What it does not do.** Stop a determined human farming accounts. That is item
8, and the two are not substitutes.

---

### 15. Payments

**What it is.** Only relevant if SocialUs ever takes a cut, charges for
placement, or handles escrow. It does none of those today.

**Who provides it.** Stripe. No fixed monthly cost, per-transaction only, so
there is nothing to pay until there is something to charge.

**Trigger to revisit.** The moment money moves, item 1's commercial-use question
stops being a gray area and Vercel Pro becomes mandatory rather than advisable.
Taking payments also pulls in tax handling and a refund policy, so treat it as a
scenario and not an integration.

---

### 16. Push notifications

**What it is.** Reaching a user who does not have the tab open.

**Who provides it.** Nobody, for the web: the Web Push API with self-generated
VAPID keys costs nothing and needs no vendor. Generate the key pair with
`npx web-push generate-vapid-keys`, store the subscription per member, send from
a scheduled job on item 7's pattern. A service is only required for native iOS
and Android, which is not on the 2026-10-30 path.

**Do not** add an SMS provider for this. Per-message cost with no free tier, for
a notification email already covers at Launch scale.

---

## Deliberately not bought

| Tempting | Why not |
|---|---|
| Algolia, Typesense | Postgres full-text search is in Supabase already |
| Cloudinary, imgix | Client-side resize in item 3 does the job |
| Cloudflare in front | Vercel already provides CDN and SSL |
| Supabase PITR | $100/month against a $25 plan, see item 10 |
| Vercel Speed Insights | Buy it when you have a performance complaint |
| Session replay | Item 13 answers the questions you actually have |

---

## Environment variables

`.env.local.example` is the authoritative list with inline notes. This is the
deployment view: what belongs in Vercel, and which item put it there.

| Variable | Scope | Item |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All | 2 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All | 2 |
| `SUPABASE_SECRET_KEY` | All, server-only | 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | All, server-only | 2, legacy alias of the above |
| `NEXT_PUBLIC_SITE_URL` | Production | 2 |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | All | 4 |
| `MAPBOX_GEOCODING_TOKEN` | All, server-only | 4 |
| `RESEND_API_KEY` | All | 6 |
| `FOLLOW_EMAIL_FROM` | All | 6 |
| `CRON_SECRET` | All | 7 |
| `AUTH_BEFORE_USER_CREATED_HOOK_SECRET` | All | 8 |
| `ADMIN_EMAILS` | All | UI gating, item 9 |
| `DATABASE_URL` | **Production and Preview** (and local) | Action-layer pool, item 10 — see the note below |
| `SIGNUP_BLOCKED_EMAIL_DOMAINS` | Optional | 8 |
| `SIGNUP_ALLOWED_EMAIL_DOMAINS` | Optional | 8 |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Local only | Playwright evals |

### `DATABASE_URL` — the one that took the app down

**Set it in Production AND Preview.** It was missing from both for four months
(2026-05-11 to 2026-09-16) and **every write in the app was down the whole
time** — signup, Page creation, follows, posts, reports. Reads were unaffected,
because they go through PostgREST and never touch this pool, so the app looked
healthy. Nothing detected it: the unit suite runs against a local stack, the
build never connects, and no check ran against a deployed environment. That is
what `/api/health/db` and `.github/workflows/deploy-health.yml` now cover.

**Use the Supavisor pooler URL, not the direct host:**

```
postgresql://postgres.<PROJECT_REF>:<URL-ENCODED-PASSWORD>@aws-0-us-west-2.pooler.supabase.com:5432/postgres
```

- **Why the pooler.** `db.<ref>.supabase.co` publishes **AAAA only — no A
  record**. Vercel functions and GitHub runners are IPv4-only, so the direct
  host is simply unreachable from both. `scripts/supabase-db-url.sh` prints the
  DNS evidence on every run.
- **Percent-encode the password.** Database passwords routinely contain
  `@ : / ? #`, every one of which changes the meaning of a connection string. A
  raw paste fails with an error that points nowhere near the cause.
- **The shard is not derivable from the ref.** `socialus-db` answers on
  `aws-0-us-west-2` (verified 2026-09-13); newer projects sit on `aws-1`.
- **Generate it rather than assembling it by hand:**
  `SUPABASE_PROJECT_REF=<ref> SUPABASE_DB_PASSWORD=<password> bash scripts/supabase-db-url.sh`
  — it encodes the password, tries both shards, verifies the connection, and
  prints the URL on stdout with its reasoning on stderr.

> **This does not contradict the backup guidance above.** The "use the
> pooler-free connection string" line under item 11 is about **`pg_dump` only**
> — session pooling and `pg_dump` interact badly. That is a constraint on dumps,
> not on the app. The running app uses the pooler; dumps use the direct string,
> from a host that has IPv6.

Added by the wire-ups above, not yet in the example file:

| Variable | Item |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 8 |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | 11 |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | 13 |

---

## Database setup

The schema is the migration set in `supabase/migrations/`, applied in numeric
order. Do not hand-run SQL in the dashboard editor.

```bash
supabase link --project-ref <project-ref>   # once, for a remote project
supabase db push                            # applies migrations in order
```

Locally, `supabase start` or `supabase db reset` applies the same set.

> **Do not run anything in `scripts/*.sql`.** Those are pre-rebuild artifacts.
> `001-create-tables.sql` opens with `drop table … cascade` and then builds a
> schema that contradicts the current model. It is scheduled for deletion.

### Showcase data

`supabase/seeds/the-good-place.sql` populates a wholly fictional locality
(6 places, 8 members, 4 venues, 3 groups, 16 items, plus memberships, tags,
responses and event-log rows) so every public surface renders something
real-looking. Idempotent: re-running refreshes the demo calendar rather than
duplicating rows. Entry point `/?place=the-good-place`. Teardown is commented
out at the bottom of the file.

```bash
psql "$SUPABASE_DB_URL" -f supabase/seeds/the-good-place.sql
```

---

## Launch checklist

**Platform**

- [ ] Supabase project linked, `supabase db push` applied cleanly
      (`supabase migration list`)
- [ ] RLS verified against anon and authenticated roles.
      `tests/rls-coverage.test.ts` is `describe.skipIf(!DATABASE_URL)`, so with
      no `DATABASE_URL` it reports skipped and **reads as green without having
      run**. Set it in `.env.test.local` first.
- [ ] Supabase Pro, spend cap **on**
- [ ] Vercel Pro, spend alert at $60
- [ ] Production env vars set in Vercel, including the three wire-up additions
- [ ] Custom domain live with SSL, `NEXT_PUBLIC_SITE_URL` matching
- [ ] Scoped Mapbox production token with URL restriction
- [ ] `npm run build` green on Vercel

**Required before real users**

- [ ] Resend set as Supabase custom SMTP, domain verified, auth rate limit
      raised (item 6a)
- [ ] Two concurrent magic-link signups both arrive (item 6)
- [ ] Nightly `pg_dump` running, **one restore rehearsed** (item 10)
- [ ] Storage-in-backup question resolved (item 10)
- [ ] Sentry reporting from production with readable source maps (item 11)
- [ ] UptimeRobot keyword monitor on a database-backed page (item 12)
- [ ] PostHog capturing the five agreed events (item 13)
- [ ] Turnstile enforced server-side by Supabase (item 8)
- [ ] Report control and review queue shipped, scenario approved in
      `ops-pattern` first (item 9)
- [ ] OG images verified ([opengraph.xyz](https://opengraph.xyz))

**First month**

- [ ] Mapbox loads weekly against the 50k ceiling (item 4)
- [ ] Resend sends against the 100/day ceiling (item 6)
- [ ] Supabase egress against the 250 GB ceiling (item 2)

---

Vendor quotas, dashboard paths and CLI flags move. Confirm each against current
documentation before relying on it, particularly Vercel's included-usage
allotments and the Supabase Storage backup question in item 10.
