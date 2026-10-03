### chore #280 — builder accounts on the live app

Don, 2026-10-01: one builder account per test persona (signed out aside). Each sees the app exactly as its persona would. Nothing a builder makes shows to a real member or counts in a number; builders see each other's content.

- **Who is a builder:** `public.builders` (member, persona, disabled_at). RLS is on with no policies and no grants, so no client can read it.
- **Isolation, in SQL:**
  - Restrictive SELECT policies on Pages, posts, items, RSVPs, memberships, follows and locations.
  - The functions that run as their owner restate the same filter: `browse_feed`, `announcements_withheld`, `page_listed_member_counts`, `venue_hosted_items`, `posted_item_id`, `group_url_prefixes`.
  - `discoverable_items` drops builder items, and builder responses from `response_count`.
- **Numbers the handlers keep:**
  - A builder never moves a metro waitlist count.
  - A builder's report on a real Page is stored and queued but never hides anything.
  - The real operator's queue leaves out builder reports and builder Pages.
- **Operator persona:** `BUILDER_OPERATOR_MEMBER_ID`, separate from the real operator.
- **Log:** the `builder_actions` view over the four event tables, service role only. Sign-ins are in Supabase's auth log.
- **Accounts:** `scripts/builders.ts` (provision, list, disable, enable), run in production by the "Builder accounts (production)" workflow.
  - Passwords derive from the `BUILDER_SEED` secret and are never printed.
  - Disable bans the login.
  - No text code and no legal name, per the ruling.
- **Proof:**
  - `tests/builder-isolation-db.test.ts`: 11 checks, 9 seen failing before the isolation half of the migration.
  - Handler, queue and credential tests seen failing first.
  - `scripts/builder-isolation-probe.sh` asks production the same questions after apply.

**Migration: `20261001100000_builder_accounts.sql`.** Apply after #263 (end time) is applied, verified and merged. It restates `browse_feed` as of #263.
