# Copy inventory — every word the app shows a person

**Audit and worksheet. Nothing here is a proposal, and nothing has been
rewritten.** Produced 2026-09-15 against `main` at `640e1fc`. Issue #89.

Two things in one file: an **inventory** of every user-facing string, and a
**worksheet** marking which surfaces could carry the product's premise copy and
how much room each spot has.

## What this is, and how to read it

Every user-facing string in `socialus-web`, grouped by **surface** — what a person
is looking at — rather than by file, because the thing being audited is what a
person experiences in a sitting, and one screen is assembled from many files.

**584 strings across 118 files.** That is the whole of the product's voice, and
none of it is centralized: there is no copy module, no string catalogue, no
`i18n` layer. Every word is inline in the component that renders it.

### How it was collected

A extractor over all 214 non-test `.ts`/`.tsx` files pulling JSX text nodes,
`placeholder` / `aria-label` / `alt` / `title` / `label` attributes, Next.js
`metadata` titles and descriptions, and thrown or displayed error and status
strings. Heuristics exclude identifiers, CSS classes, and URLs. It is thorough
rather than perfect: a string assembled at runtime from parts, or one passed
through several components, may appear under the file that defines it rather
than the screen that shows it. Roughly 11 strings resisted classification and
sit under *Uncategorised*.

### What is NOT in here, and where it actually lives

- **The magic-link email — the only transactional message a person receives
  today — is not in this repo.** It is a Supabase dashboard template (see #74),
  which means it is outside version control, outside review, and outside this
  inventory. Nobody on the team can see its current wording without logging in.
- **No other email copy exists.** `RESEND_API_KEY` and `FOLLOW_EMAIL_FROM` sit in
  `.env.local.example` and nothing in `src/` reads them.
- **`FOLLOW_EMAIL_FROM` said `Movers, Makers & Shakers`** — the retired product
  name — so the first email a member would receive, if that path were ever
  built, would have come from a company that no longer exists. **Fixed in the
  repo (#96).** The deployed value is a Vercel environment variable and is not
  version-controlled; whether it still carries the old name is Don's to check.

### The counts

| Surface | Strings |
|---|---|
| RETIRED farmers-market surfaces | 164 |
| Create / sell walkthrough + composers | 122 |
| A Page (group/"shop") in public | 36 |
| Signup, sign-in and auth | 28 |
| Action-layer errors (server) | 28 |
| Browse (`/explore`) | 27 |
| Dev-only demo routes | 23 |
| Home and the locality feed | 20 |
| You (account surface) | 20 |
| Shared libs and types | 16 |
| Member profile | 15 |
| Join / marketing page | 15 |
| Locations and venues | 14 |
| Uncategorised | 11 |
| Onboarding | 9 |
| An Item in public | 9 |
| Metro waitlist (F076, new) | 8 |
| Reporting and moderation | 8 |
| Following | 7 |
| Places | 4 |

**28% of the product's copy — 164 strings — belongs to surfaces that were
retired.** `register-vendor`, `vendors/[slug]`, `business/[slug]`,
`you/vendor/*`, and the market/bulletin components. Some are reachable today.

---

## Premise-copy worksheet

**The constraint, from Don: a few sentences, spread throughout. Never a
manifesto on one page.** So this marks *where* a "why this exists" line could
sit and *how much room* that spot has. It does not write any.

**Room is a property of the slot, not a preference.** Three sizes:

| Room | Means | Slot types |
|---|---|---|
| **None** | the words are the control | buttons, labels, menu items, field labels, chips |
| **A line** | one sentence, sometimes two | empty states, banners, toasts, confirmations, helper text |
| **A few sentences** | a short paragraph | onboarding steps, composer step intros, signed-out heroes |

**✓ candidate · ~ possible · ✗ no** — the last meaning the surface should not
carry premise copy, either because it is being retired, because it is not
member-facing, or because the words there are purely functional.

| Surface | Premise copy? | Most room available | Why |
|---|---|---|---|
| Onboarding | **✓** | **a few sentences** | Multi-step, already has a subhead under each question. The natural home, and the only place a person is reading rather than doing. |
| Create / sell walkthrough + composers | **✓** | **a few sentences** | Six steps, each with room for one line of *why this step*. Directly adjacent to the attestation copy about to be written. |
| Signup, sign-in and auth | **✓** | **a line** | One line under the heading. `role-language.md` already drafts the shape of it. |
| A Page (group/"shop") in public | **✓** | **a line** | The empty state a visitor hits on a Page with nothing listed — often the first thing a stranger sees. |
| Reporting and moderation | **✓** | **a line** | *Already does this.* "This goes to a person, not a queue" is the best premise line in the app — proof the pattern works at this size. |
| Home and the locality feed | **~** | **a line** | The signed-out banner and the empty feed. Competes with the feed itself for attention. |
| Browse (`/explore`) | **~** | **a line** | The empty state only. Browse is a working surface; a person here is looking for something. |
| Metro waitlist (F076) | **~** | **a line, heavily constrained** | The popup message. **F076 criterion 9 forbids implying a date, a timeline or that the metro will open** — a premise line here is possible but has a hard edge, and is tested. |
| You (account surface) | **~** | **a line** | Signed-out state has room; signed-in is a control panel. |
| Following | **~** | **a line** | Empty state only. |
| Member profile | **~** | **a line** | The empty-profile state. A person's own page is mostly theirs, not ours. |
| Join / marketing page | **~** | **a few sentences — and the risk** | The one page where a manifesto would accumulate by gravity. Worth marking as the place the constraint is most likely to break. |
| An Item in public | **✗** | a line, but content-driven | The member's own words carry this surface. |
| Locations and venues | **✗** | none to a line | Functional. |
| Places | **✗** | — | Placeholder surface until b2. |
| RETIRED farmers-market surfaces | **✗** | — | 164 strings. Do not invest until #4 below is answered. |
| Dev-only demo routes | **✗** | — | Not member-facing. |
| Action-layer errors (server) | **✗** | — | Should not reach a member at all — see finding 6. |
| Shared libs and types | **✗** | — | Not a surface. |

### Named slots, for the candidates

Where the line would actually go, and what occupies that space today. **Nothing
below is a proposal — it is the slot and its current occupant.**

| Slot | Room | What is there now |
|---|---|---|
| Onboarding, name step — under the question | a few sentences | "This is the name your neighbors will see." |
| Onboarding, metro step — under the question | a few sentences | "We are not everywhere yet. Tell us where you are and we will tell you where it stands." |
| Sign-in form — under the heading | a line | "Enter your email and we'll send you a link. No password — new here or not, this is the way in." |
| Sell walkthrough — per step | a line each, ×6 | step-specific instructions only; no *why* anywhere |
| A Page with nothing listed | a line | "[Name] hasn't listed anything yet — check back soon." *(and the spacing bug)* |
| A Page a visitor cannot fill — the follow CTA | a line | "Sign up to follow" |
| Report sheet | a line | **"This goes to a person, not a queue."** |
| Waitlist popup | a line, constrained | "This metro needs 299 more people before there is enough here to be worth showing you." |
| Signed-out home banner | a line | "Sign in to set your home locality and follow what you love." |
| Browse, no results | a line | "Nothing here yet — try another filter" |

### Where the constraint will break, if it breaks

Three pressures worth naming before anyone writes:

1. **The Join page.** Long, already the most voice-heavy surface, and the
   natural gravity well for a manifesto. If premise copy concentrates anywhere,
   it will be here.
2. **Onboarding.** The only surface with room for *a few sentences* in more than
   one consecutive step — so it can become a manifesto by accumulation, one
   reasonable paragraph at a time, without any single step looking wrong.
3. **Empty states.** Eleven of them, all with room for a line. Consistent premise
   copy across all eleven is a manifesto delivered in instalments. Some should
   stay purely functional.

---

## The inventory

### Signup, sign-in and auth

_28 strings across 7 files._

| What it says | Kind | Where |
|---|---|---|
| NextResponse.redirect( | body/heading/button | `app/auth/callback/route.ts:20` |
| Sign in with a password | body/heading/button | `app/auth/password/page.tsx:21` |
| Promise | body/heading/button | `components/auth/EmailFirstSignup.tsx:27` |
| Enter a valid email address. | error or status message | `components/auth/EmailFirstSignup.tsx:80` |
| Something went wrong. Try again. | error or status message | `components/auth/EmailFirstSignup.tsx:88` |
| Password must be at least 8 characters. | error or status message | `components/auth/EmailFirstSignup.tsx:98` |
| You already have an account — enter your password. | error or status message | `components/auth/EmailFirstSignup.tsx:108` |
| Enter your password. | error or status message | `components/auth/EmailFirstSignup.tsx:124` |
| Check your email | body/heading/button | `components/auth/EmailFirstSignup.tsx:163` |
| Use a different email | body/heading/button | `components/auth/EmailFirstSignup.tsx:168` |
| Confirm your email | body/heading/button | `components/auth/EmailFirstSignup.tsx:177` |
| Continue with Google | body/heading/button | `components/auth/EmailFirstSignup.tsx:199` |
| you@example.com | placeholder | `components/auth/EmailFirstSignup.tsx:216` |
| Sign in with a magic link instead | body/heading/button | `components/auth/EmailFirstSignup.tsx:289` |
| Enter a valid email address. | error or status message | `components/auth/MagicLinkForm.tsx:26` |
| Check your email | body/heading/button | `components/auth/MagicLinkForm.tsx:42` |
| Use a different email | body/heading/button | `components/auth/MagicLinkForm.tsx:54` |
| Sign in to SocialUs | body/heading/button | `components/auth/MagicLinkForm.tsx:63` |
| Enter your email and we’ll send you a link. No password — new here or not, this is the way in. | body/heading/button | `components/auth/MagicLinkForm.tsx:66` |
| you@example.com | placeholder | `components/auth/MagicLinkForm.tsx:76` |
| Email address | aria-label | `components/auth/MagicLinkForm.tsx:77` |
| Sign Out | body/heading/button | `components/AuthButton.tsx:18` |
| Sign In | body/heading/button | `components/AuthButton.tsx:29` |
| Sign in | body/heading/button | `components/AuthCtaButtons.tsx:99` |
| Close | aria-label | `components/AuthGateModal.tsx:36` |
| Sign in | body/heading/button | `components/AuthGateModal.tsx:49` |
| We email you a link — no password, takes 30 seconds. | body/heading/button | `components/AuthGateModal.tsx:52` |
| List your business → | body/heading/button | `components/AuthGateModal.tsx:58` |

### Onboarding

_9 strings across 2 files._

| What it says | Kind | Where |
|---|---|---|
| You must be signed in. | error or status message | `app/onboarding/actions.ts:27` |
| Promise | body/heading/button | `components/onboarding/OnboardingFlow.tsx:16` |
| Add your name. | error or status message | `components/onboarding/OnboardingFlow.tsx:52` |
| Where are you, and why? | body/heading/button | `components/onboarding/OnboardingFlow.tsx:82` |
| We are not everywhere yet. Tell us where you are and we will tell you where it stands. | body/heading/button | `components/onboarding/OnboardingFlow.tsx:84` |
| What should we call you? | body/heading/button | `components/onboarding/OnboardingFlow.tsx:101` |
| This is the name your neighbors will see. | body/heading/button | `components/onboarding/OnboardingFlow.tsx:102` |
| Your name | body/heading/button | `components/onboarding/OnboardingFlow.tsx:107` |
| Continue | body/heading/button | `components/onboarding/OnboardingFlow.tsx:143` |

### Metro waitlist (F076, new)

_8 strings across 2 files._

| What it says | Kind | Where |
|---|---|---|
| You must be signed in. | error or status message | `app/_actions/metro-waitlist-actions.ts:45` |
| That metro is not on the list. | error or status message | `app/_actions/metro-waitlist-actions.ts:56` |
| Promise | body/heading/button | `components/metro/MetroWaitlistStep.tsx:30` |
| Try again | body/heading/button | `components/metro/MetroWaitlistStep.tsx:79` |
| Where are you? | body/heading/button | `components/metro/MetroWaitlistStep.tsx:90` |
| Pick your metro | body/heading/button | `components/metro/MetroWaitlistStep.tsx:99` |
| What brings you here? | body/heading/button | `components/metro/MetroWaitlistStep.tsx:110` |
| I make things | label | `components/metro/MetroWaitlistStep.tsx:115` |

### Home and the locality feed

_20 strings across 6 files._

| What it says | Kind | Where |
|---|---|---|
| No matches near you yet. | body/heading/button | `components/feed/FeedEmptyState.tsx:12` |
| Any Place in your state | body/heading/button | `components/feed/FeedEmptyState.tsx:28` |
| CalendarDays, | body/heading/button | `components/feed/ItemFeedCard.tsx:8` |
| HandHeart, | body/heading/button | `components/feed/ItemFeedCard.tsx:11` |
| Handshake, | body/heading/button | `components/feed/ItemFeedCard.tsx:12` |
| Lightbulb, | body/heading/button | `components/feed/ItemFeedCard.tsx:13` |
| Package, | body/heading/button | `components/feed/ItemFeedCard.tsx:14` |
| Where are you? | body/heading/button | `components/feed/LocalityFeed.tsx:50` |
| We couldn’t detect your locality. Pick a Place to see what’s nearby. | body/heading/button | `components/feed/LocalityFeed.tsx:52` |
| Make this yours | body/heading/button | `components/feed/MakeThisYoursBanner.tsx:12` |
| Sign in to set your home locality and follow what you love. | body/heading/button | `components/feed/MakeThisYoursBanner.tsx:14` |
| Sign in | body/heading/button | `components/feed/MakeThisYoursBanner.tsx:18` |
| Showing | body/heading/button | `components/feed/ScopePicker.tsx:22` |
| Choose a locality | aria-label | `components/feed/ScopePicker.tsx:26` |
| SocialUs | body/heading/button | `components/HomeFeed.tsx:136` |
| You | aria-label | `components/HomeFeed.tsx:138` |
| Search vendors, products, markets | body/heading/button | `components/HomeFeed.tsx:157` |
| Markets, vendor specials, and community events in the next 30 days. | body/heading/button | `components/HomeFeed.tsx:166` |
| From vendors you follow | body/heading/button | `components/HomeFeed.tsx:196` |
| Explore vendors → | body/heading/button | `components/HomeFeed.tsx:230` |

### Browse (/explore)

_27 strings across 8 files._

| What it says | Kind | Where |
|---|---|---|
| Loading… | body/heading/button | `app/explore/page.tsx:6` |
| Active filters | aria-label | `components/explore/ActiveFilterChips.tsx:24` |
| DEFAULT_SECONDARY, | body/heading/button | `components/explore/ExploreFilterSheet.tsx:16` |
| DISTANCE_OPTIONS, | body/heading/button | `components/explore/ExploreFilterSheet.tsx:17` |
| SCHEDULE_OPTIONS, | body/heading/button | `components/explore/ExploreFilterSheet.tsx:18` |
| SORT_OPTIONS, | body/heading/button | `components/explore/ExploreFilterSheet.tsx:19` |
| Close filters | aria-label | `components/explore/ExploreFilterSheet.tsx:132` |
| Filters | body/heading/button | `components/explore/ExploreFilterSheet.tsx:138` |
| Clear all | body/heading/button | `components/explore/ExploreFilterSheet.tsx:154` |
| Distance | label | `components/explore/ExploreFilterSheet.tsx:160` |
| Any distance | label | `components/explore/ExploreFilterSheet.tsx:169` |
| Schedule | label | `components/explore/ExploreFilterSheet.tsx:186` |
| Category | label | `components/explore/ExploreFilterSheet.tsx:201` |
| Sort | label | `components/explore/ExploreFilterSheet.tsx:217` |
| Show results | body/heading/button | `components/explore/ExploreFilterSheet.tsx:242` |
| Search | aria-label | `components/explore/ExploreSearchBar.tsx:68` |
| Search Explore | aria-label | `components/explore/ExploreSearchBar.tsx:105` |
| Search events, products, services, ideas | placeholder | `components/explore/ExploreSearchBar.tsx:106` |
| Clear search | aria-label | `components/explore/ExploreSearchBar.tsx:118` |
| Filter by kind | aria-label | `components/explore/KindFilterPills.tsx:56` |
| View | aria-label | `components/explore/ListMapToggle.tsx:53` |
| DEFAULT_SECONDARY, | body/heading/button | `components/ExplorePage.tsx:17` |
| Nothing here yet — try another filter. | body/heading/button | `components/ExplorePage.tsx:166` |
| Clear filters | body/heading/button | `components/ExplorePage.tsx:172` |
| Math.sin(dLat / 2) ** 2 + | body/heading/button | `lib/explore/filters.ts:184` |
| Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2 | body/heading/button | `lib/explore/filters.ts:185` |
| = range.start.getTime() && t | body/heading/button | `lib/explore/filters.ts:198` |

### A Page (group/"shop") in public

_36 strings across 10 files._

| What it says | Kind | Where |
|---|---|---|
| ActionError, | body/heading/button | `app/p/[...slug]/claim-actions.ts:23` |
| Not found — SocialUs | page title | `app/p/[...slug]/page.tsx:95` |
| ${product.title} — SocialUs | page title | `app/p/[...slug]/page.tsx:98` |
| ${service.title} — SocialUs | page title | `app/p/[...slug]/page.tsx:118` |
| ${gathering.title} — SocialUs | page title | `app/p/[...slug]/page.tsx:138` |
| ${venue.label} — SocialUs | page title | `app/p/[...slug]/page.tsx:155` |
| ${shop.displayName} — SocialUs | page title | `app/p/[...slug]/page.tsx:171` |
| Place not found — SocialUs | page title | `app/p/[...slug]/page.tsx:179` |
| Browse what | share/meta description | `app/p/[...slug]/page.tsx:187` |
| The curated landing for this place ships at b2 (places.md § T2). | body/heading/button | `app/p/[...slug]/page.tsx:364` |
| Sign up to follow | body/heading/button | `components/group/FollowShopButton.tsx:29` |
| Following ${shopName} is coming soon. | error or status message | `components/group/FollowShopButton.tsx:40` |
| Your photo is hidden for now. | body/heading/button | `components/group/HiddenPhotoNotice.tsx:25` |
| Promise | body/heading/button | `components/group/LocallyOwnedClaim.tsx:26` |
| Enter a 5-digit US ZIP code. | error or status message | `components/group/LocallyOwnedClaim.tsx:49` |
| Locally Owned claim | body/heading/button | `components/group/LocallyOwnedClaim.tsx:85` |
| Your business ZIP | body/heading/button | `components/group/LocallyOwnedClaim.tsx:91` |
| Remove your Locally Owned claim? The badge will stop showing. | body/heading/button | `components/group/LocallyOwnedClaim.tsx:135` |
| Remove claim | body/heading/button | `components/group/LocallyOwnedClaim.tsx:145` |
| Keep it | body/heading/button | `components/group/LocallyOwnedClaim.tsx:153` |
| Add ZIP | body/heading/button | `components/group/LocallyOwnedClaim.tsx:168` |
| Claimed local owner | body/heading/button | `components/group/LocallyOwnedClaim.tsx:175` |
| More options | aria-label | `components/group/PageOverflowMenu.tsx:83` |
| Promise | body/heading/button | `components/group/ReportControl.tsx:27` |
| Rendered inline it became a flex sibling of the ⋯ and squeezed the | body/heading/button | `components/group/ReportControl.tsx:68` |
| Page title into two lines — the confirmation is not a control and | body/heading/button | `components/group/ReportControl.tsx:69` |
| Dismiss | body/heading/button | `components/group/ReportControl.tsx:86` |
| Promise | body/heading/button | `components/group/ReportSheet.tsx:28` |
| Close | aria-label | `components/group/ReportSheet.tsx:123` |
| This goes to a person, not a queue. | body/heading/button | `components/group/ReportSheet.tsx:135` |
| In your own words. | placeholder | `components/group/ReportSheet.tsx:147` |
| Draft — not yet public. | body/heading/button | `components/group/ShopPublicPage.tsx:63` |
| Resume walkthrough | body/heading/button | `components/group/ShopPublicPage.tsx:65` |
| Products & services | body/heading/button | `components/group/ShopPublicPage.tsx:181` |
| Nothing listed yet | body/heading/button | `components/group/ShopPublicPage.tsx:187` |
| 0 && n.length | body/heading/button | `lib/groups/tags.ts:32` |

### An Item in public (product/service/gathering)

_9 strings across 4 files._

| What it says | Kind | Where |
|---|---|---|
| Where | body/heading/button | `components/item/GatheringPublicPage.tsx:114` |
| Cost | body/heading/button | `components/item/GatheringPublicPage.tsx:124` |
| Capacity | body/heading/button | `components/item/GatheringPublicPage.tsx:131` |
| What to bring | body/heading/button | `components/item/GatheringPublicPage.tsx:145` |
| Shop page). Individual items attribute to the Member with a conditional | body/heading/button | `components/item/ProductPublicPage.tsx:56` |
| Locally Made | body/heading/button | `components/item/ProductPublicPage.tsx:97` |
| Pickup point | body/heading/button | `components/item/ProductPublicPage.tsx:115` |
| Service area | body/heading/button | `components/item/ServicePublicPage.tsx:96` |
| ` or a product `…/g/ | body/heading/button | `lib/items/resolve-gathering.ts:41` |

### Member profile

_15 strings across 6 files._

| What it says | Kind | Where |
|---|---|---|
| You must be signed in. | error or status message | `app/m/[handle]/actions.ts:16` |
| Not found — SocialUs | page title | `app/m/[handle]/e/[slug]/page.tsx:34` |
| ${gathering.title} — SocialUs | page title | `app/m/[handle]/e/[slug]/page.tsx:37` |
| Not found — SocialUs | page title | `app/m/[handle]/p/[slug]/page.tsx:22` |
| ${product.title} — SocialUs | page title | `app/m/[handle]/p/[slug]/page.tsx:25` |
| Not found — SocialUs | page title | `app/m/[handle]/page.tsx:31` |
| Private profile — SocialUs | page title | `app/m/[handle]/page.tsx:34` |
| ${page.displayName} (@${page.handle}) — SocialUs | page title | `app/m/[handle]/page.tsx:38` |
| This member's profile is private. | body/heading/button | `app/m/[handle]/page.tsx:65` |
| Not found — SocialUs | page title | `app/m/[handle]/s/[slug]/page.tsx:22` |
| ${service.title} — SocialUs | page title | `app/m/[handle]/s/[slug]/page.tsx:25` |
| Edit profile | body/heading/button | `components/member/MemberPublicPage.tsx:56` |
| Posts | body/heading/button | `components/member/MemberPublicPage.tsx:71` |
| Nothing posted yet. | body/heading/button | `components/member/MemberPublicPage.tsx:77` |
| Groups | body/heading/button | `components/member/MemberPublicPage.tsx:98` |

### Create / sell walkthrough + composers

_122 strings across 12 files._

| What it says | Kind | Where |
|---|---|---|
| ActionError, | body/heading/button | `app/you/sell/actions.ts:25` |
| Math.random().toString(36).slice(2, 10) | body/heading/button | `app/you/sell/actions.ts:226` |
| Your shops | body/heading/button | `app/you/sell/page.tsx:121` |
| List a product, service, or gathering under one of your shops. | body/heading/button | `app/you/sell/page.tsx:123` |
| Active shop | body/heading/button | `app/you/sell/page.tsx:136` |
| Multi-owner partnership Groups land in b2. | body/heading/button | `app/you/sell/page.tsx:160` |
| Promise | body/heading/button | `components/composer/AddEntityDrawer.tsx:44` |
| Close | aria-label | `components/composer/AddEntityDrawer.tsx:168` |
| Add and select | body/heading/button | `components/composer/AddEntityDrawer.tsx:232` |
| Promise | body/heading/button | `components/composer/MultiStepComposer.tsx:48` |
| Math.min(Math.max(resumeFromStep, 0), steps.length - 1), | body/heading/button | `components/composer/MultiStepComposer.tsx:78` |
| Close | aria-label | `components/composer/MultiStepComposer.tsx:192` |
| Skip this step | body/heading/button | `components/composer/MultiStepComposer.tsx:266` |
| Host a gathering | body/heading/button | `components/sell/AddGatheringButton.tsx:53` |
| Add a product | body/heading/button | `components/sell/AddProductButton.tsx:55` |
| Add a service | body/heading/button | `components/sell/AddServiceButton.tsx:55` |
| MultiStepComposer, | body/heading/button | `components/sell/GatheringComposer.tsx:24` |
| Promise | body/heading/button | `components/sell/GatheringComposer.tsx:59` |
| Host a gathering | page title | `components/sell/GatheringComposer.tsx:146` |
| Details | page title | `components/sell/GatheringComposer.tsx:182` |
| Title | body/heading/button | `components/sell/GatheringComposer.tsx:187` |
| Thursday Run Club | placeholder | `components/sell/GatheringComposer.tsx:191` |
| Description | body/heading/button | `components/sell/GatheringComposer.tsx:197` |
| Easy 5k from the brewery patio, all paces welcome. | placeholder | `components/sell/GatheringComposer.tsx:202` |
| When | page title | `components/sell/GatheringComposer.tsx:223` |
| Open meetups have no fixed schedule — people drop in whenever. | body/heading/button | `components/sell/GatheringComposer.tsx:232` |
| You can add specific times later from the gathering page. | body/heading/button | `components/sell/GatheringComposer.tsx:233` |
| Date | body/heading/button | `components/sell/GatheringComposer.tsx:239` |
| Time | body/heading/button | `components/sell/GatheringComposer.tsx:252` |
| Capacity (optional) | body/heading/button | `components/sell/GatheringComposer.tsx:278` |
| Capacity | aria-label | `components/sell/GatheringComposer.tsx:282` |
| No limit | placeholder | `components/sell/GatheringComposer.tsx:285` |
| Cost (optional — leave blank if free) | body/heading/button | `components/sell/GatheringComposer.tsx:292` |
| Cost | aria-label | `components/sell/GatheringComposer.tsx:296` |
| Free | placeholder | `components/sell/GatheringComposer.tsx:299` |
| What to bring (optional) | body/heading/button | `components/sell/GatheringComposer.tsx:306` |
| What to bring | aria-label | `components/sell/GatheringComposer.tsx:310` |
| Water, good shoes | placeholder | `components/sell/GatheringComposer.tsx:312` |
| Review | page title | `components/sell/GatheringComposer.tsx:335` |
| Kind: | body/heading/button | `components/sell/GatheringComposer.tsx:341` |
| Title: | body/heading/button | `components/sell/GatheringComposer.tsx:345` |
| When: | body/heading/button | `components/sell/GatheringComposer.tsx:349` |
| Cost: | body/heading/button | `components/sell/GatheringComposer.tsx:356` |
| Where: | body/heading/button | `components/sell/GatheringComposer.tsx:360` |
| MultiStepComposer, | body/heading/button | `components/sell/ProductComposer.tsx:20` |
| LocationPlaceFields, | body/heading/button | `components/sell/ProductComposer.tsx:25` |
| Promise | body/heading/button | `components/sell/ProductComposer.tsx:63` |
| Add a product | page title | `components/sell/ProductComposer.tsx:116` |
| Title | body/heading/button | `components/sell/ProductComposer.tsx:121` |
| Country Sourdough Loaf | placeholder | `components/sell/ProductComposer.tsx:125` |
| Description | body/heading/button | `components/sell/ProductComposer.tsx:132` |
| Naturally leavened, baked Saturday mornings. | placeholder | `components/sell/ProductComposer.tsx:138` |
| This is free | body/heading/button | `components/sell/ProductComposer.tsx:155` |
| Price | aria-label | `components/sell/ProductComposer.tsx:166` |
| Per (optional) | body/heading/button | `components/sell/ProductComposer.tsx:178` |
| Price unit | aria-label | `components/sell/ProductComposer.tsx:182` |
| Pickup point | page title | `components/sell/ProductComposer.tsx:211` |
| Where is this made? | page title | `components/sell/ProductComposer.tsx:230` |
| The Locally Made claim (a Place picker for where this product is | body/heading/button | `components/sell/ProductComposer.tsx:240` |
| Review | page title | `components/sell/ProductComposer.tsx:252` |
| Title: | body/heading/button | `components/sell/ProductComposer.tsx:258` |
| Price: | body/heading/button | `components/sell/ProductComposer.tsx:261` |
| Pickup: | body/heading/button | `components/sell/ProductComposer.tsx:272` |
| Locally Made: | body/heading/button | `components/sell/ProductComposer.tsx:275` |
| Pickup Location options | aria-label | `components/sell/ProductComposer.tsx:343` |
| Add a Location | title attr | `components/sell/ProductComposer.tsx:393` |
| Location name | body/heading/button | `components/sell/ProductComposer.tsx:399` |
| Sunday Farmers Market | placeholder | `components/sell/ProductComposer.tsx:405` |
| SellWalkthrough, | body/heading/button | `components/sell/SellCta.tsx:26` |
| ReturnType | body/heading/button | `components/sell/SellCta.tsx:42` |
| Your shop | body/heading/button | `components/sell/SellCta.tsx:167` |
| MultiStepComposer, | body/heading/button | `components/sell/SellWalkthrough.tsx:23` |
| LocationPlaceFields, | body/heading/button | `components/sell/SellWalkthrough.tsx:28` |
| Promise | body/heading/button | `components/sell/SellWalkthrough.tsx:66` |
| Brand name | page title | `components/sell/SellWalkthrough.tsx:155` |
| Oak Park Sourdough | placeholder | `components/sell/SellWalkthrough.tsx:163` |
| Anchor Location | page title | `components/sell/SellWalkthrough.tsx:178` |
| What you do | page title | `components/sell/SellWalkthrough.tsx:197` |
| About | page title | `components/sell/SellWalkthrough.tsx:215` |
| Public description | aria-label | `components/sell/SellWalkthrough.tsx:223` |
| I bake sourdough from a home kitchen and sell at the Sunday market. | placeholder | `components/sell/SellWalkthrough.tsx:225` |
| Are you locally owned? | page title | `components/sell/SellWalkthrough.tsx:237` |
| ZIP code | body/heading/button | `components/sell/SellWalkthrough.tsx:243` |
| Claimed | body/heading/button | `components/sell/SellWalkthrough.tsx:258` |
| Verified | body/heading/button | `components/sell/SellWalkthrough.tsx:259` |
| Documented | body/heading/button | `components/sell/SellWalkthrough.tsx:259` |
| Review | page title | `components/sell/SellWalkthrough.tsx:276` |
| Brand: | body/heading/button | `components/sell/SellWalkthrough.tsx:282` |
| Anchor Location: | body/heading/button | `components/sell/SellWalkthrough.tsx:285` |
| About: | body/heading/button | `components/sell/SellWalkthrough.tsx:289` |
| (none) | body/heading/button | `components/sell/SellWalkthrough.tsx:293` |
| Locally owned ZIP: | body/heading/button | `components/sell/SellWalkthrough.tsx:297` |
| (skipped) | body/heading/button | `components/sell/SellWalkthrough.tsx:301` |
| SellWalkthrough.onComplete: draftGroupId missing | error or status message | `components/sell/SellWalkthrough.tsx:395` |
| Anchor Location options | aria-label | `components/sell/SellWalkthrough.tsx:566` |
| Add a Location | title attr | `components/sell/SellWalkthrough.tsx:616` |
| Location name | body/heading/button | `components/sell/SellWalkthrough.tsx:622` |
| Maya | placeholder | `components/sell/SellWalkthrough.tsx:628` |
| MultiStepComposer, | body/heading/button | `components/sell/ServiceComposer.tsx:22` |
| LocationPlaceFields, | body/heading/button | `components/sell/ServiceComposer.tsx:27` |
| Promise | body/heading/button | `components/sell/ServiceComposer.tsx:86` |
| Add a service | page title | `components/sell/ServiceComposer.tsx:128` |
| Title | body/heading/button | `components/sell/ServiceComposer.tsx:133` |
| Piano lessons — 30 min | placeholder | `components/sell/ServiceComposer.tsx:137` |
| Description | body/heading/button | `components/sell/ServiceComposer.tsx:144` |
| In-home lessons for all ages, beginner to intermediate. | placeholder | `components/sell/ServiceComposer.tsx:150` |
| Pricing | page title | `components/sell/ServiceComposer.tsx:173` |
| Pricing model | body/heading/button | `components/sell/ServiceComposer.tsx:181` |
| This is free | body/heading/button | `components/sell/ServiceComposer.tsx:209` |
| Rate | aria-label | `components/sell/ServiceComposer.tsx:219` |
| Service area | page title | `components/sell/ServiceComposer.tsx:245` |
| Review | page title | `components/sell/ServiceComposer.tsx:270` |
| Title: | body/heading/button | `components/sell/ServiceComposer.tsx:280` |
| Pricing: | body/heading/button | `components/sell/ServiceComposer.tsx:283` |
| Center: | body/heading/button | `components/sell/ServiceComposer.tsx:291` |
| Travels: | body/heading/button | `components/sell/ServiceComposer.tsx:294` |
| Center Location options | aria-label | `components/sell/ServiceComposer.tsx:365` |
| How far do you travel? (miles) | body/heading/button | `components/sell/ServiceComposer.tsx:415` |
| Service radius in miles | aria-label | `components/sell/ServiceComposer.tsx:419` |
| Add a Location | title attr | `components/sell/ServiceComposer.tsx:430` |
| Location name | body/heading/button | `components/sell/ServiceComposer.tsx:436` |
| My studio | placeholder | `components/sell/ServiceComposer.tsx:442` |

### You (account surface)

_20 strings across 4 files._

| What it says | Kind | Where |
|---|---|---|
| Following — SocialUs | page title | `app/you/following/page.tsx:16` |
| Following | body/heading/button | `app/you/following/page.tsx:32` |
| Everything you follow, in one place. | body/heading/button | `app/you/following/page.tsx:33` |
| Loading… | body/heading/button | `app/you/page.tsx:43` |
| You | body/heading/button | `app/you/page.tsx:149` |
| Sign in to follow vendors and save your market. We email you a link — no password. | body/heading/button | `app/you/page.tsx:150` |
| Sign in | body/heading/button | `app/you/page.tsx:152` |
| Are you a business owner? | body/heading/button | `app/you/page.tsx:155` |
| List your business → | body/heading/button | `app/you/page.tsx:160` |
| Switch to vendor mode → | body/heading/button | `app/you/page.tsx:180` |
| Your Market | body/heading/button | `app/you/page.tsx:190` |
| Not set | body/heading/button | `app/you/page.tsx:196` |
| Notifications | body/heading/button | `app/you/page.tsx:312` |
| Email me when followed vendors are at upcoming markets | body/heading/button | `app/you/page.tsx:314` |
| Sign out | body/heading/button | `app/you/page.tsx:319` |
| Explore → | body/heading/button | `app/you/page.tsx:333` |
| Primary | aria-label | `components/BottomNav.tsx:62` |
| SocialUs | body/heading/button | `components/BottomNav.tsx:118` |
| Search businesses... | placeholder | `components/SearchBar.tsx:141` |
| Clear search | aria-label | `components/SearchBar.tsx:153` |

### Following

_7 strings across 1 files._

| What it says | Kind | Where |
|---|---|---|
| Following | body/heading/button | `app/following/page.tsx:89` |
| Sign up to follow vendors and get updates when they're at the market. | body/heading/button | `app/following/page.tsx:90` |
| Sign in | body/heading/button | `app/following/page.tsx:95` |
| Loading… | body/heading/button | `app/following/page.tsx:107` |
| You're not following anyone yet. | body/heading/button | `app/following/page.tsx:111` |
| Browse vendors | body/heading/button | `app/following/page.tsx:113` |
| No upcoming market dates | body/heading/button | `app/following/page.tsx:151` |

### Reporting and moderation

_8 strings across 2 files._

| What it says | Kind | Where |
|---|---|---|
| What area does this concern? | body/heading/button | `components/PillarSelector.tsx:24` |
| Thank you. Your report has been submitted. | body/heading/button | `components/ReportForm.tsx:67` |
| Report a Concern | body/heading/button | `components/ReportForm.tsx:88` |
| Close | aria-label | `components/ReportForm.tsx:89` |
| What happened? | body/heading/button | `components/ReportForm.tsx:96` |
| Describe the concern factually... | placeholder | `components/ReportForm.tsx:102` |
| Source link (optional) | body/heading/button | `components/ReportForm.tsx:121` |
| I witnessed this personally | body/heading/button | `components/ReportForm.tsx:138` |

### Locations and venues

_14 strings across 3 files._

| What it says | Kind | Where |
|---|---|---|
| Address | body/heading/button | `components/locations/LocationPlaceFields.tsx:125` |
| 123 Main St, Sacramento, CA | placeholder | `components/locations/LocationPlaceFields.tsx:137` |
| Address suggestions | aria-label | `components/locations/LocationPlaceFields.tsx:146` |
| Searching… | body/heading/button | `components/locations/LocationPlaceFields.tsx:165` |
| Rather give a neighbourhood? | body/heading/button | `components/locations/LocationPlaceFields.tsx:198` |
| Neighbourhood | body/heading/button | `components/locations/LocationPlaceFields.tsx:204` |
| Choose a neighbourhood | body/heading/button | `components/locations/LocationPlaceFields.tsx:214` |
| Give a street address instead | body/heading/button | `components/locations/LocationPlaceFields.tsx:228` |
| Follow this venue | body/heading/button | `components/venue/FollowVenueButton.tsx:42` |
| Host something here | body/heading/button | `components/venue/VenuePublicPage.tsx:107` |
| What's happening here | body/heading/button | `components/venue/VenuePublicPage.tsx:115` |
| Nothing scheduled yet. | body/heading/button | `components/venue/VenuePublicPage.tsx:122` |
| About | body/heading/button | `components/venue/VenuePublicPage.tsx:142` |
| Accessibility: | body/heading/button | `components/venue/VenuePublicPage.tsx:151` |

### Places

_4 strings across 2 files._

| What it says | Kind | Where |
|---|---|---|
| Breadcrumb | aria-label | `components/place-breadcrumb.tsx:3` |
| reverseGeocodeToPlace: lat and lon must be finite numbers | error or status message | `lib/places/reverse-geocode.ts:223` |
| 90 \|\| lon | body/heading/button | `lib/places/reverse-geocode.ts:225` |
| reverseGeocodeToPlace: lat/lon out of WGS84 range | error or status message | `lib/places/reverse-geocode.ts:226` |

### RETIRED farmers-market surfaces

_164 strings across 17 files._

| What it says | Kind | Where |
|---|---|---|
| Read more | body/heading/button | `app/business/[slug]/BusinessListingPage.tsx:95` |
| Support | body/heading/button | `app/business/[slug]/BusinessListingPage.tsx:111` |
| Report a Concern | body/heading/button | `app/business/[slug]/BusinessListingPage.tsx:133` |
| Business Not Found — SocialUs | page title | `app/business/[slug]/page.tsx:29` |
| ${business.name} — SocialUs | page title | `app/business/[slug]/page.tsx:41` |
| You already have a vendor listing | body/heading/button | `app/register-vendor/page.tsx:189` |
| Each account can have one listing. Editing and deletion are coming soon — for now, reach out if you need changes. | body/heading/button | `app/register-vendor/page.tsx:191` |
| View my listing | body/heading/button | `app/register-vendor/page.tsx:197` |
| List your vendor booth | body/heading/button | `app/register-vendor/page.tsx:207` |
| Tell customers who you are and where to find you. Takes about 90 seconds. | body/heading/button | `app/register-vendor/page.tsx:209` |
| Vendor name | label | `app/register-vendor/page.tsx:214` |
| e.g. Honeybee Hollow | placeholder | `app/register-vendor/page.tsx:220` |
| Tagline (one sentence) | label | `app/register-vendor/page.tsx:225` |
| Raw wildflower honey from the Sierra foothills | placeholder | `app/register-vendor/page.tsx:232` |
| What do you sell? | label | `app/register-vendor/page.tsx:238` |
| Primary category: | body/heading/button | `app/register-vendor/page.tsx:263` |
| Which markets do you sell at? | label | `app/register-vendor/page.tsx:283` |
| Loading markets… | body/heading/button | `app/register-vendor/page.tsx:286` |
| Where is your vendor based? | body/heading/button | `app/register-vendor/page.tsx:325` |
| Your home, farm, or studio address — used to pin your listing on the map. | body/heading/button | `app/register-vendor/page.tsx:327` |
| Street | label | `app/register-vendor/page.tsx:330` |
| City | label | `app/register-vendor/page.tsx:340` |
| State | label | `app/register-vendor/page.tsx:349` |
| Your story (optional) | label | `app/register-vendor/page.tsx:372` |
| Tell customers who you are, how you got started, what makes your product special… | placeholder | `app/register-vendor/page.tsx:377` |
| Cover photo URL (optional) | label | `app/register-vendor/page.tsx:384` |
| Website (optional) | label | `app/register-vendor/page.tsx:397` |
| Instagram handle (optional) | label | `app/register-vendor/page.tsx:406` |
| Contact email (optional) | label | `app/register-vendor/page.tsx:415` |
| you@example.com | placeholder | `app/register-vendor/page.tsx:420` |
| Vendor Not Found — SocialUs | page title | `app/vendors/[slug]/page.tsx:43` |
| ${vendor.name} — SocialUs | page title | `app/vendors/[slug]/page.tsx:49` |
| Market Schedule | body/heading/button | `app/vendors/[slug]/VendorProfilePage.tsx:62` |
| Currently not listed at any markets | body/heading/button | `app/vendors/[slug]/VendorProfilePage.tsx:64` |
| About | body/heading/button | `app/vendors/[slug]/VendorProfilePage.tsx:99` |
| Contact | body/heading/button | `app/vendors/[slug]/VendorProfilePage.tsx:106` |
| Loading… | body/heading/button | `app/you/vendor/bulletins/[id]/page.tsx:56` |
| Bulletin not found. | body/heading/button | `app/you/vendor/bulletins/[id]/page.tsx:60` |
| Delivered | label | `app/you/vendor/bulletins/[id]/page.tsx:86` |
| Opened | label | `app/you/vendor/bulletins/[id]/page.tsx:87` |
| Clicked | label | `app/you/vendor/bulletins/[id]/page.tsx:88` |
| Unsubscribed | label | `app/you/vendor/bulletins/[id]/page.tsx:89` |
| New Bulletin | body/heading/button | `app/you/vendor/bulletins/new/page.tsx:69` |
| Title (optional) | body/heading/button | `app/you/vendor/bulletins/new/page.tsx:76` |
| What | placeholder | `app/you/vendor/bulletins/new/page.tsx:81` |
| Body | body/heading/button | `app/you/vendor/bulletins/new/page.tsx:87` |
| What do you want followers to know? Plain text only — markdown is coming later. | placeholder | `app/you/vendor/bulletins/new/page.tsx:92` |
| Preview | body/heading/button | `app/you/vendor/bulletins/new/page.tsx:100` |
| Cancel | body/heading/button | `app/you/vendor/bulletins/new/page.tsx:121` |
| Bulletins | body/heading/button | `app/you/vendor/bulletins/page.tsx:78` |
| New bulletin | body/heading/button | `app/you/vendor/bulletins/page.tsx:80` |
| Loading… | body/heading/button | `app/you/vendor/bulletins/page.tsx:84` |
| You haven't sent any bulletins yet. | body/heading/button | `app/you/vendor/bulletins/page.tsx:88` |
| Write your first bulletin | body/heading/button | `app/you/vendor/bulletins/page.tsx:90` |
| Loading… | body/heading/button | `app/you/vendor/page.tsx:31` |
| ← Back to You | body/heading/button | `app/you/vendor/page.tsx:103` |
| Vendor mode | body/heading/button | `app/you/vendor/page.tsx:107` |
| Bulletins → | body/heading/button | `app/you/vendor/page.tsx:110` |
| Followers | label | `app/you/vendor/page.tsx:196` |
| Profile views (7d) | label | `app/you/vendor/page.tsx:203` |
| Support clicks (7d) | label | `app/you/vendor/page.tsx:210` |
| Bulletin opens (7d) | label | `app/you/vendor/page.tsx:217` |
| Listing health | body/heading/button | `app/you/vendor/page.tsx:295` |
| Suggested next step | body/heading/button | `app/you/vendor/page.tsx:311` |
| Fix it → | body/heading/button | `app/you/vendor/page.tsx:316` |
| Date.parse(f.created_at) | body/heading/button | `app/you/vendor/page.tsx:340` |
| Total followers | body/heading/button | `app/you/vendor/page.tsx:347` |
| Last 90 days | body/heading/button | `app/you/vendor/page.tsx:351` |
| Export followers | body/heading/button | `app/you/vendor/page.tsx:356` |
| CSV with display name, city, followed_at | body/heading/button | `app/you/vendor/page.tsx:357` |
| Export CSV | body/heading/button | `app/you/vendor/page.tsx:364` |
| Recent followers | body/heading/button | `app/you/vendor/page.tsx:369` |
| No followers yet. | body/heading/button | `app/you/vendor/page.tsx:371` |
| = now - hoursEnd * 3600 * 1000 && t | body/heading/button | `app/you/vendor/page.tsx:418` |
| = dayStart && Date.parse(e.created_at) | body/heading/button | `app/you/vendor/page.tsx:448` |
| = dayStart && Date.parse(f.created_at) | body/heading/button | `app/you/vendor/page.tsx:450` |
| This week vs last | body/heading/button | `app/you/vendor/page.tsx:457` |
| Last 14 days | body/heading/button | `app/you/vendor/page.tsx:477` |
| Day | body/heading/button | `app/you/vendor/page.tsx:481` |
| Views | body/heading/button | `app/you/vendor/page.tsx:482` |
| Supports | body/heading/button | `app/you/vendor/page.tsx:483` |
| Follows | body/heading/button | `app/you/vendor/page.tsx:484` |
| Top tasks | body/heading/button | `app/you/vendor/page.tsx:549` |
| All set up ✓ — keep posting. | body/heading/button | `app/you/vendor/page.tsx:551` |
| Name | label | `components/admin/MarketForm.tsx:82` |
| Slug | label | `components/admin/MarketForm.tsx:83` |
| City | label | `components/admin/MarketForm.tsx:84` |
| State | label | `components/admin/MarketForm.tsx:85` |
| Geocode helper | body/heading/button | `components/admin/MarketForm.tsx:89` |
| e.g. 1234 Main St, Folsom CA | placeholder | `components/admin/MarketForm.tsx:91` |
| Lookup | body/heading/button | `components/admin/MarketForm.tsx:92` |
| Latitude | label | `components/admin/MarketForm.tsx:108` |
| Longitude | label | `components/admin/MarketForm.tsx:109` |
| Schedule days | body/heading/button | `components/admin/MarketForm.tsx:113` |
| Start time | label | `components/admin/MarketForm.tsx:124` |
| End time | label | `components/admin/MarketForm.tsx:125` |
| Description | label | `components/admin/MarketForm.tsx:128` |
| Delete | body/heading/button | `components/admin/MarketForm.tsx:134` |
| Identity | title attr | `components/admin/VendorForm.tsx:103` |
| Name | label | `components/admin/VendorForm.tsx:105` |
| Slug | label | `components/admin/VendorForm.tsx:106` |
| Tagline | label | `components/admin/VendorForm.tsx:107` |
| Story | label | `components/admin/VendorForm.tsx:109` |
| Address | title attr | `components/admin/VendorForm.tsx:112` |
| Geocode helper | body/heading/button | `components/admin/VendorForm.tsx:114` |
| full address | placeholder | `components/admin/VendorForm.tsx:116` |
| Lookup | body/heading/button | `components/admin/VendorForm.tsx:117` |
| Street | label | `components/admin/VendorForm.tsx:132` |
| City | label | `components/admin/VendorForm.tsx:133` |
| State | label | `components/admin/VendorForm.tsx:134` |
| Zip | label | `components/admin/VendorForm.tsx:135` |
| Latitude | label | `components/admin/VendorForm.tsx:136` |
| Longitude | label | `components/admin/VendorForm.tsx:137` |
| Categories & ownership | title attr | `components/admin/VendorForm.tsx:141` |
| Primary category | body/heading/button | `components/admin/VendorForm.tsx:151` |
| Ownership tier | label | `components/admin/VendorForm.tsx:157` |
| Markets | title attr | `components/admin/VendorForm.tsx:164` |
| Links & contact | title attr | `components/admin/VendorForm.tsx:175` |
| Website URL | label | `components/admin/VendorForm.tsx:177` |
| Instagram handle (no @) | label | `components/admin/VendorForm.tsx:178` |
| Contact email | label | `components/admin/VendorForm.tsx:179` |
| Cover photo URL | label | `components/admin/VendorForm.tsx:180` |
| Featured vendor | body/heading/button | `components/admin/VendorForm.tsx:184` |
| Delete vendor | body/heading/button | `components/admin/VendorForm.tsx:191` |
| Bulletin options | aria-label | `components/BulletinFeedCard.tsx:85` |
| Close | aria-label | `components/BusinessDetailCard.tsx:45` |
| Read more | body/heading/button | `components/BusinessDetailCard.tsx:98` |
| Support | body/heading/button | `components/BusinessDetailCard.tsx:114` |
| Report a Concern | body/heading/button | `components/BusinessDetailCard.tsx:133` |
| Sign in to report | body/heading/button | `components/BusinessDetailCard.tsx:141` |
| Your Market: | body/heading/button | `components/MarketPill.tsx:33` |
| Select your market | body/heading/button | `components/MarketPill.tsx:37` |
| Math.sin(dLat / 2) ** 2 + | body/heading/button | `components/MarketSelector.tsx:20` |
| Math.cos((a.lat * Math.PI) / 180) * | body/heading/button | `components/MarketSelector.tsx:21` |
| Math.cos((b.lat * Math.PI) / 180) * | body/heading/button | `components/MarketSelector.tsx:22` |
| Math.sin(dLng / 2) ** 2 | body/heading/button | `components/MarketSelector.tsx:23` |
| a.distance !== null && a.distance | body/heading/button | `components/MarketSelector.tsx:59` |
| Close | aria-label | `components/MarketSelector.tsx:125` |
| Search markets by name or city | placeholder | `components/MarketSelector.tsx:135` |
| Near You | body/heading/button | `components/MarketSelector.tsx:146` |
| Other Markets | body/heading/button | `components/MarketSelector.tsx:153` |
| Clear selection | body/heading/button | `components/MarketSelector.tsx:170` |
| I own this business myself or with a partner | share/meta description | `components/OwnershipSelector.tsx:7` |
| This business is owned by its workers or members | share/meta description | `components/OwnershipSelector.tsx:8` |
| I own a franchise location locally | share/meta description | `components/OwnershipSelector.tsx:9` |
| This business is owned by a corporation or investment firm | share/meta description | `components/OwnershipSelector.tsx:12` |
| Ownership Type | body/heading/button | `components/OwnershipSelector.tsx:24` |
| No one listed yet in Sacramento | body/heading/button | `components/RecruitmentGrid.tsx:84` |
| List here | body/heading/button | `components/RecruitmentGrid.tsx:90` |
| Example | body/heading/button | `components/RecruitmentGrid.tsx:101` |
| Sign up like this | body/heading/button | `components/RecruitmentGrid.tsx:113` |
| Example listing | body/heading/button | `components/RecruitmentGrid.tsx:124` |
| Featured Maker | body/heading/button | `components/RecruitmentGrid.tsx:133` |
| Clara's Kitchen | body/heading/button | `components/RecruitmentGrid.tsx:135` |
| Sourdough loaves, brown-butter cookies, and seasonal jams — baked from a home kitchen in Oak Park. | body/heading/button | `components/RecruitmentGrid.tsx:137` |
| Pickup Saturdays at the Midtown Farmers Market. | body/heading/button | `components/RecruitmentGrid.tsx:138` |
| Home Baker | body/heading/button | `components/RecruitmentGrid.tsx:141` |
| Cottage Food Permit | body/heading/button | `components/RecruitmentGrid.tsx:142` |
| Sacramento, CA | body/heading/button | `components/RecruitmentGrid.tsx:143` |
| Create your listing | body/heading/button | `components/RecruitmentGrid.tsx:151` |
| Listing costs nothing · about 90 seconds | body/heading/button | `components/RecruitmentGrid.tsx:153` |
| We're looking for makers in Sacramento | body/heading/button | `components/RecruitmentGrid.tsx:165` |
| Every spot below is open. Listing costs nothing and takes about 90 seconds. | body/heading/button | `components/RecruitmentGrid.tsx:167` |
| Open spots by category | body/heading/button | `components/RecruitmentGrid.tsx:177` |

### Join / marketing page

_15 strings across 1 files._

| What it says | Kind | Where |
|---|---|---|
| For vendors | body/heading/button | `app/join/page.tsx:52` |
| Sell at a farmers market? Get listed. | body/heading/button | `app/join/page.tsx:54` |
| SocialUs helps the customers you meet at the market find you the other six days of the week. | body/heading/button | `app/join/page.tsx:57` |
| Listing costs nothing. | body/heading/button | `app/join/page.tsx:58` |
| Already a member? Log in | body/heading/button | `app/join/page.tsx:73` |
| Followable between markets | title attr | `app/join/page.tsx:83` |
| Listing costs nothing | title attr | `app/join/page.tsx:87` |
| Local-first audience | title attr | `app/join/page.tsx:91` |
| How it works | body/heading/button | `app/join/page.tsx:99` |
| Create an account | title attr | `app/join/page.tsx:101` |
| Tell customers who you are | title attr | `app/join/page.tsx:104` |
| Your profile goes live | title attr | `app/join/page.tsx:109` |
| Customers follow you | title attr | `app/join/page.tsx:114` |
| Share with another vendor | body/heading/button | `app/join/page.tsx:132` |
| Know someone at the market who should be on here? Send them this link. | body/heading/button | `app/join/page.tsx:134` |

### Dev-only demo routes

_23 strings across 2 files._

| What it says | Kind | Where |
|---|---|---|
| Location name | body/heading/button | `app/(dev)/add-entity-demo/page.tsx:20` |
| Maya | placeholder | `app/(dev)/add-entity-demo/page.tsx:26` |
| AddEntityDrawer demo | body/heading/button | `app/(dev)/add-entity-demo/page.tsx:44` |
| Dev surface for verifying the secondary-drawer sub-flow recipe in | body/heading/button | `app/(dev)/add-entity-demo/page.tsx:46` |
| Add a Location | body/heading/button | `app/(dev)/add-entity-demo/page.tsx:57` |
| MultiStepComposer, | body/heading/button | `app/(dev)/composer-demo/page.tsx:9` |
| Brand name | page title | `app/(dev)/composer-demo/page.tsx:24` |
| Name | body/heading/button | `app/(dev)/composer-demo/page.tsx:28` |
| Oak Park Sourdough | placeholder | `app/(dev)/composer-demo/page.tsx:33` |
| Anchor city | page title | `app/(dev)/composer-demo/page.tsx:44` |
| City | body/heading/button | `app/(dev)/composer-demo/page.tsx:48` |
| Sacramento | placeholder | `app/(dev)/composer-demo/page.tsx:53` |
| About (optional) | page title | `app/(dev)/composer-demo/page.tsx:64` |
| About | body/heading/button | `app/(dev)/composer-demo/page.tsx:69` |
| Review and create | page title | `app/(dev)/composer-demo/page.tsx:81` |
| Brand: | body/heading/button | `app/(dev)/composer-demo/page.tsx:85` |
| City: | body/heading/button | `app/(dev)/composer-demo/page.tsx:86` |
| About: | body/heading/button | `app/(dev)/composer-demo/page.tsx:87` |
| (skipped) | body/heading/button | `app/(dev)/composer-demo/page.tsx:87` |
| MultiStepComposer demo | body/heading/button | `app/(dev)/composer-demo/page.tsx:101` |
| Dev surface for verifying the composer recipe in isolation. Per | body/heading/button | `app/(dev)/composer-demo/page.tsx:103` |
| T071 acceptance — not for production use. | body/heading/button | `app/(dev)/composer-demo/page.tsx:104` |
| Open composer | body/heading/button | `app/(dev)/composer-demo/page.tsx:114` |

### Action-layer errors (server)

_28 strings across 16 files._

| What it says | Kind | Where |
|---|---|---|
| Promise | body/heading/button | `actions/_lib/db.ts:43` |
| appendEvent: unknown event table ${table} | error or status message | `actions/_lib/event-log.ts:84` |
| Promise | body/heading/button | `actions/_lib/handler.ts:25` |
| = S extends ZodSchema | body/heading/button | `actions/_lib/handler.ts:44` |
| = z.infer | body/heading/button | `actions/_lib/handler.ts:45` |
| group.create: insert returned no row | error or status message | `actions/group/create.ts:93` |
| group.member_join: actingMemberId must be resolved before invocation | error or status message | `actions/group/member-join.ts:39` |
| group.member_leave: actingMemberId must be resolved before invocation | error or status message | `actions/group/member-leave.ts:38` |
| WAITLIST_ROLES, | body/heading/button | `actions/index.ts:90` |
| ActionError, | body/heading/button | `actions/index.ts:96` |
| ValidationError, | body/heading/button | `actions/index.ts:97` |
| AuthorizationError, | body/heading/button | `actions/index.ts:98` |
| ConflictError, | body/heading/button | `actions/index.ts:99` |
| NotFoundError, | body/heading/button | `actions/index.ts:100` |
| TransientError, | body/heading/button | `actions/index.ts:101` |
| ACTION_ERROR_HTTP_STATUS, | body/heading/button | `actions/index.ts:102` |
| item.attach_location: insert returned no row | error or status message | `actions/item/attach-location.ts:67` |
| item.create: insert returned no row | error or status message | `actions/item/create.ts:143` |
| MAX_HANDLE_COLLISION_SUFFIX, | body/heading/button | `actions/member/create.ts:23` |
| member.create: insert succeeded but returned no id | error or status message | `actions/member/create.ts:125` |
| ${name}: actingMemberId must be resolved before invocation | error or status message | `actions/member/follow.ts:36` |
| SECONDARY_LIMIT, | body/heading/button | `actions/member/index.ts:8` |
| Boolean(v.placeId) \|\| | body/heading/button | `actions/member/saved-search-create.ts:28` |
| Boolean(v.locationId) \|\| | body/heading/button | `actions/member/saved-search-create.ts:29` |
| member.saved_search.restore: actingMemberId must be resolved before invocation | error or status message | `actions/member/saved-search-restore.ts:40` |
| Boolean(next.place_id) \|\| | body/heading/button | `actions/member/saved-search-update.ts:80` |
| Boolean(next.location_id) \|\| | body/heading/button | `actions/member/saved-search-update.ts:81` |
| WAITLIST_ROLES, | body/heading/button | `actions/metro/index.ts:5` |

### Shared libs and types

_16 strings across 6 files._

| What it says | Kind | Where |
|---|---|---|
| ENCODE_TIMEOUT_MS, | body/heading/button | `lib/media/upload-image.ts:76` |
| hasActiveBusinessGroup: failed to read memberships: ${error.message} | error or status message | `lib/member/hasActiveBusinessGroup.ts:32` |
| = 4 && h.length | body/heading/button | `lib/onboarding/handles.ts:7` |
| getDraftGroup: failed to read active memberships: ${activeErr.message} | error or status message | `lib/sell/getDraftGroup.ts:90` |
| getDraftGroup: failed to read drafts: ${draftErr.message} | error or status message | `lib/sell/getDraftGroup.ts:112` |
| `; only the | body/heading/button | `lib/standard-webhook.ts:11` |
| Single-location, owner-operated | share/meta description | `lib/types.ts:203` |
| Community rooted | share/meta description | `lib/types.ts:208` |
| Local owner, national brand | share/meta description | `lib/types.ts:213` |
| Actively competing against a monopoly | share/meta description | `lib/types.ts:218` |
| B Corp, public benefit corp, or demonstrated commitment to community | share/meta description | `lib/types.ts:223` |
| Absent owner, money leaving town | share/meta description | `lib/types.ts:228` |
| Deceptive practices, refusal of service, discrimination | share/meta description | `lib/types.ts:236` |
| Wage theft, unsafe conditions, exploitation, retaliation | share/meta description | `lib/types.ts:241` |
| Pollution, displacement, hostile behavior | share/meta description | `lib/types.ts:246` |
| Environmental violations, animal cruelty, resource destruction | share/meta description | `lib/types.ts:251` |

### Uncategorised

_11 strings across 7 files._

| What it says | Kind | Where |
|---|---|---|
| You must be signed in. | error or status message | `app/_actions/group-membership-actions.ts:19` |
| You must be signed in. | error or status message | `app/_actions/report-actions.ts:22` |
| ActionError, | body/heading/button | `app/_actions/saved-search-actions.ts:18` |
| You must be signed in. | error or status message | `app/_actions/saved-search-actions.ts:25` |
| ACTION_ERROR_HTTP_STATUS, | body/heading/button | `app/api/internal/auth-signup/route.ts:17` |
| ActionError, | body/heading/button | `app/api/internal/auth-signup/route.ts:18` |
| Category | body/heading/button | `components/CategoryInput.tsx:52` |
| e.g. Restaurant, Veterinary, Grocery | placeholder | `components/CategoryInput.tsx:63` |
| Nothing followed yet — start exploring. | body/heading/button | `components/follows/FollowingManager.tsx:172` |
| Explore → | body/heading/button | `components/follows/FollowingManager.tsx:177` |
| Following | body/heading/button | `components/follows/FollowingSummary.tsx:40` |

---

## Findings

### 1. There is already a style guide. Nothing follows it.

`ops-pattern/product/foundation/role-language.md` is a ratified copy discipline
with **seven numbered rules and worked examples of the exact copy**. It is not a
sketch — it specifies sign-up copy, the create prompt, gathering responses,
empty states, and profile headers, and explains why each. It ends: *"this is a
naming and copy discipline, not a schema change."*

The app violates most of it. Measured against its own rules:

| Rule | What the app does |
|---|---|
| 2 — *no umbrella noun for either side* | **"vendor" appears in 20 user-facing strings**: "Browse vendors", "For vendors", "Vendor name", "List your vendor booth", "Sign up to follow vendors" |
| 3 — *no stored role, mode, or account type* | **"Switch to vendor mode →"** (`app/you/page.tsx:180`) — the doc names `members.maker_mode_enabled` as a mistake already made and retired |
| 6 — *"producer", "seller", "maker" are spec words, not labels* | **"Featured Maker"**, **"Home Baker"** rendered as labels (`components/RecruitmentGrid.tsx`) |
| *"A Page's people: 'Who's here' — never 'followers', never 'audience'"* | **"Followers"**, "Total followers", "Recent followers", "Export followers", "No followers yet.", **"Local-first audience"** |
| 5 — *no zero-counters on a person's own work* | **"No followers yet."** on the owner's own surface (`app/you/vendor/page.tsx`) |

The identity noun is specified as **member**, lowercase and nearly invisible.
The app instead uses *vendor* as the primary label for a person.

### 2. The app does not use its own canonical noun

`nouns.md` ratified **Page** on 2026-09-07 as *"the UI name for a `groups` row —
the line every other doc is checked against."*

**"Page" appears in user-facing copy zero times.** The one hit in the codebase is
a code comment. What a person actually sees for the same concept:

- **"shop"** — "Your shop", "Active shop", `${shop.displayName} — SocialUs`
- **"vendor"** — "You already have a vendor listing", "Vendor name"
- **"business"** — "This business is owned by its workers or members"
- **"listing"** — "View my listing", "Get listed"
- **"booth"** — "List your vendor booth"

Five words for one noun, none of them the ratified one.

### 3. At least three voices, and they map to product eras

**A — farmers-market transactional** (the retired product, 164 strings).
Title Case headings, marketplace vocabulary: "Market Schedule", "Your Market",
"Export CSV", "New Bulletin", "List your vendor booth". Speaks to a stallholder
about a stall.

**B — plain, warm, second person** (the newer surfaces). Sentence case, direct
address, contractions: "What should we call you?", "This is the name your
neighbors will see.", "We email you a link — no password."

**C — engineer's register**, leaking into the UI. "Multi-owner partnership
Groups land in b2." (`app/you/sell/page.tsx:160`) states a *release bundle* to a
member. "Plain text only — markdown is coming later." exposes the format
roadmap. Both are roadmap facts addressed to the wrong audience.

Voice B is closest to `role-language.md`. It is also the minority.

### 4. Concrete inconsistencies

**Same action, different case.** "Sign In" / "Sign Out" (`AuthButton.tsx`) versus
"Sign in" / "Sign out" everywhere else (`AuthCtaButtons`, `AuthGateModal`,
`MakeThisYoursBanner`, `app/you/page.tsx`). Both reachable in one session.

**Same action, different verb.** "Sign in" (11 places) vs **"Log in"**
(`app/join/page.tsx:73` — "Already a member? Log in"). One product, two verbs
for one door.

**Case is split roughly 24 / 108** across short labels — title case is the
minority but is not confined to the retired surfaces: "Ownership Type",
"Near You", "Other Markets", "Report a Concern", "Add a Location".

**Terminology contradicting the model.** "Groups" rendered capitalised as a
profile section (`components/member/MemberPublicPage.tsx:98`) — the schema word
surfacing as a UI label.

**Product name.** 25 strings say "SocialUs". `package.json`, `README.md`,
`BUILD-LOG.md` and `FOLLOW_EMAIL_FROM` said "Movers, Makers & Shakers" —
**all fixed in the repo (#96)**. What remains is outside version control: the
deployed Vercel env var, and the Supabase-hosted email templates.

### 5. One confirmed rendering bug, and it is invisible to the tests

`components/group/ShopPublicPage.tsx:189` renders **"Maya Riverahasn't listed
anything yet"** — no space.

The source is correct; it contains a real space. The cause is the **JSX
multi-line text rule**: a text node that begins on the same line as an
expression and then *wraps* has each of its lines trimmed, so the leading space
is removed. Next's build emits `[displayName ?? "This Shop", "hasn't listed…"]`
and React joins array children with nothing.

**The test toolchain does not reproduce it.** A render test of this exact
component passes — vitest's transform preserves the space where Next's strips
it. So no unit test can catch this class of bug.

Scope, checked rather than assumed: **4 sites** have the `{expr} text` shape;
**3 are safe** (their text does not wrap — `" locations"` and `" item"` keep
their space in the built output), **1 is broken**. Bounded, but the mechanism
means any future wrapped line after an expression is silently at risk.

### 6. Internal vocabulary reaching people

- **"b2"** — a release-bundle identifier, shown to members.
- **"markdown"** — a format name, in a helper hint.
- **"Groups"**, **"Member"** — schema nouns as UI labels.
- **Action-layer error strings are prefixed with handler names** —
  `"item.create: insert returned no row"`, `"group.member_join: actingMemberId
  must be resolved before invocation"`. 28 of these exist. They are thrown as
  `Error` and the server-action wrappers re-throw them as plain `Error`, so
  whether a member can see one depends on the call path — a real risk, not a
  certainty, and worth settling deliberately.

### 7. What the design docs already say about copy

Beyond `role-language.md`:

- **`design-language.md`** — *"Trust microcopy next to a primary CTA states
  what's true right now, in the present tense — never a promise about the
  future."* ("Listing costs nothing," not "no fees, ever.")
- **`people-first.md`** — no ranking of people; the platform is about people,
  not businesses. Bears directly on "Featured Maker" and on follower counts.
- **`model.md`** — *"Item is the database word and never reaches the UI."*
- **F076 criterion 9** — the waitlist message may never state or imply a date.
  This one **is** followed, and is tested as a hard constraint.

The pattern: where a rule was written *and tested*, it holds. Where it was
written only in prose, it does not.

---

## What is needed from Don to set the voice

Not copy proposals — decisions that unblock writing. Ordered by how much they
unblock.

**1. Is `role-language.md` the voice, or a draft?**
It is ratified and specific enough to write from tomorrow. Either it governs —
and "vendor", "followers", "Featured Maker" and "vendor mode" are all bugs with
a known fix — or it does not, and it should be marked superseded before anyone
writes new copy against it. Everything else depends on this answer.

**2. What does a person call the thing they made?**
`nouns.md` says **Page**. Members currently see shop, vendor, listing, business,
booth. The new creator-attestation copy will need this word in its first
sentence.

**3. What is the platform called?**
Settled in the repo as **SocialUs** (#96). Still worth confirming the deployed
Vercel env var and the Supabase email templates carry it — neither is in version
control.

**4. Do the retired surfaces get copy, or get deleted?**
164 strings — 28% of the product's words — are farmers-market surfaces. Writing
a voice that has to cover them is a materially larger job than writing one that
does not. Worth knowing before the work is scoped, not after.

**5. How much personality, and where?**
`role-language.md` implies warm and plain ("Count me in", "No one's in yet. Be
first."). Worth confirming the ceiling — and confirming that errors and empty
states are in scope for it, since those are where the current voice is most
mechanical.

## What is deliberately not here

No rewrites, no per-string proposals, no tone-of-voice document. This is the
inventory and its current state, which is what was asked for.

**Two things worth doing regardless of the voice decision**, because they are
correctness rather than style:

- The `ShopPublicPage` spacing bug (already tracked).
- Settling whether handler-prefixed action errors can reach a member.

The premise-copy worksheet above marks **where** and **how much room** — it does
not write a single line of premise copy, and deliberately does not suggest one.
