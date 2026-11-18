# Research brief: an agent-driven SocialUs and generative UI (Don, 2026-11-18)

For Claude Desktop Projects doing research. No code access is assumed; this is what is built, how it is built, and what to find out. Facts below were read from the `socialus-web` code on 2026-11-18; anything marked *(unverified)* was not.

## What we want from you
- **Output:** options as A/B/C, each with 2–3 named precedents with links, trade-offs in one line each, and one recommendation. That is how Don decides (his rule: he sets direction, you research, he decides).
- **Not wanted:** an implementation plan, tickets, or code. Don is product manager and does not read code.
- **Say what you verified versus assumed**, and date your sources; this field moves monthly.

## The direction (Don's words, condensed)
- SocialUs becomes **agent/assistant driven: agents work on behalf of the user.**
- Don does not want to decide how the app's UI/UX is "organized"; **each user should interact however suits them** (chat, voice, browsing, a dashboard they shape).
- He is **not sure "Generative UI" means that.** Part of your job is to say what the term covers (CopilotKit's "generative UI spectrum": https://www.copilotkit.ai/generative-ui-spectrum *(not yet read by us)*) and what it does not.

## What SocialUs is
- **Two things:** local discovery, and an engine for cooperation, collaboration and community development. Discovery is the way in; bringing things to life together is where it is headed (Don, ruled 2026-11-15, `socialus-plan` `PRINCIPLES.md` § two-halves, also `product/charter.md`).
- **Theme: "Bring it to life."** Search is the main way it happens: an unmet search becomes an ask, a welcome, a maker partnership (`socialus-plan` `planning/briefs/hyper-specific-search-2026-11-15.md`).
- In practice today: a map and search over local people, Pages and posts; buy, sell, trade, teach, gather, hire, give; one metro first. Nobody uses production yet.
- Money and help stay with local people; businesses are one kind of local among many.
- Members are the investors and the only people paid out; SocialUs takes transaction income. Treat that as settled, do not research it.
- **Why this matters for your research:** an agent that only finds things is half the product. The other half is an agent that helps people organize and start things together.

## What is built (verified in code)
- **Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (Postgres, Auth, Realtime, RLS), Mapbox GL JS, Vercel, Sentry, Zod, web-push. Already installed: `@modelcontextprotocol/sdk` and Vercel's `mcp-handler`. No AI-UI library (CopilotKit, Vercel AI SDK, assistant-ui, etc.) is installed.
- **Nouns (the product's vocabulary):** Member, Page (a person's or business's presence), Item, Location, Place, Announcement (a post), Tag. About 20 declared links between them, e.g. "a Member owns a Page", "an Announcement is posted to a Page", "a Page is anchored at a Location". A Member has **no type, tier or stored role**; creator/organizer/follower are relations, not identities.
- **The action layer is the single door to all writes:** ~48 named verbs (`group.create`, `item.publish`, `member.follow`, `member.post.create`, `report.decide`, and so on), each a Zod-validated handler running in one DB transaction, registered in one file. Every write records an event row with the acting member and a trace id.
- **Agents are already anticipated in the data model:** the action context carries `viaDelegationId` ("acting on behalf of"), and a delegations table exists but is unused. It is the natural place for "an agent acts for a member."
- **An MCP server already ships**, but for our own builders, not members: `/api/knowledge/mcp` serves a project knowledge store (search, get, related, history, why, how, propose, decide), bearer key per agent, row-level security decides what each agent sees, no model runs inside it. It is a working pattern for authenticated agent access.
- **Claude is already called server-side** for content moderation (a Haiku read, escalated to Sonnet), through the raw Anthropic Messages API. No streaming chat exists.
- **UI today:** conventional screens (map and explore, Page and post pages at readable URLs like `socialus.org/sacramento-ca/plant-foundry`, a "you" area for saved/following/notifications, create flows, composer, admin). Mobile-first, checked at 390px width. Components live in feature folders; the UI is hand-built, not generated.
- **Permissions and privacy:** Postgres RLS plus a "visibility matrix" test suite that checks who can see what. Reports, moderation and a legal-reporting path exist for user content.
- **Database:** ~170 migrations. Seed data bypasses RLS, so Pages made by real handlers are the real test.

## How we build (so your options fit)
- **Roles:** Don is product manager (rulings, judgment on whether something is *right*); a planning agent owns scenarios and rulings (repo `socialus-plan`); a build agent owns the code (`socialus-web`). Method lives in `socialus-ops`.
- **Work kinds:** scenario (has pass/fail acceptance checks), change, bug, process, chore. One branch and one PR per ticket; PRs merge themselves when checks are green; merging to main deploys to production.
- **Tests:** Vitest unit tests, Playwright journeys and evals, an action-layer conformance check, the visibility matrix, mutation testing (Stryker), speed budgets and a load run. A check counts only after it has been seen failing.
- **Review:** a second session reviews any change to UI, actions or the database. Don reviews on the live site, not the code.
- **Rule of thumb for anything new:** look at what established platforms do (2–3 precedents), pick the simplest fit; if it touches money, legal or privacy exposure, or member trust it is "new territory" and goes to Don as A/B/C **before** building. **An agent acting for a member touches member trust, so this whole topic is new territory.**
- **Pace:** good enough under the deadline, not the best possible. Prefer an option that ships behind a flag in weeks over one that rebuilds the app.

## Not in this brief (ask Don, don't guess)
- The product's soul and never-break rules (`socialus-plan` `PRINCIPLES.md`, `product/ABSOLUTES.md`). Any option must be checked against them; this repo's session could not read that repo.
- Legal, payments, and money rules.

## Research questions
1. **What does "generative UI" actually mean?** Name the levels (e.g. static / declarative / open-ended, per CopilotKit and others) and what each gives a user. Does it deliver "each user interacts however suits them", or is that a different idea (agent-first / "headless" apps, chat-as-front-door)?
2. **Which tools, and what do they cost us?** Compare CopilotKit, Vercel AI SDK UI, assistant-ui, Google's A2UI, MCP-UI / MCP Apps, OpenAI Apps SDK, Anthropic's own options, and anything newer. For each: fit with Next.js 16 + Supabase on Vercel, who owns the model calls and the keys, lock-in, price, maturity.
3. **Agents acting for a member:** how do precedents handle delegation, scoped permissions, confirmation before spending or posting, and an audit trail? Does our action layer (one door, named verbs, event log, `viaDelegationId`) already do most of the work, and what is missing?
4. **MCP as the member-facing door:** should members' own assistants (Claude, ChatGPT, others) reach SocialUs through an MCP server over the same action layer, versus an assistant inside our app, versus both?
5. **Safety and trust in a local marketplace:** impersonation, spam by agents, prompt injection through user-written Pages and posts, moderation of agent-written content, and who is accountable when an agent errs.
6. **Smallest first step:** what could ship in one metro in a few weeks to learn whether members want this, without rebuilding screens? Name what it leaves out.

## Done means
- One page: the answer to question 1 in plain words, then A/B/C for the architecture (e.g. in-app assistant / member's own assistant over MCP / both), a recommendation, and the smallest first step. Everything else as an appendix.
