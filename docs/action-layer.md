# Action layer

**As of 2026-11-13** · Source: moved from socialus-plan `product/systems/action-layer.md` on 2026-11-13 (Don: it is architecture, not product) · Maintained by: hand

How every write reaches the database, and how agents (the in-app assistant, the MCP server, future federation peers) are given safe, short-lived permission to act. What the assistant is for a member is in socialus-plan `product/systems/assistant.md`; this file is only the mechanism. The stack is in `CLAUDE.md` and `INFRASTRUCTURE.md`; the PostGIS `spatial_ref_sys` RLS finding is an accepted risk in socialus-plan `accepted-risks/`.

Every write to platform state — item creation, member edit, group lifecycle — goes through one named, validated handler that commits the data row and its event-log row in the same transaction. Web, mobile, the in-app assistant, the MCP server, and future federation peers are all thin clients over the same handlers — exactly one code path per write. Letting each caller implement its own write path produces drift; this is the structural refusal of that drift, and it's what makes agent assistance safe to expose at all: the action layer is what *honors* a Member's Delegation at runtime, not just what describes it.

## The six properties of the runtime trust substrate

1. **Scoped capabilities, not long-lived secrets.** Every call carries a short-lived capability naming exactly one scope, expiring in seconds-to-minutes, non-replayable. The model/agent never sees a refreshable credential.
2. **Closed-world catalog.** Every scope a caller might exercise is enumerated in code; no handler can accept an uncatalogued scope. This is what makes accountable-participation refusals enforceable by *absence* — no `message.send.location-scope` capability exists, so no client can construct it. A new capability requires deliberately adding it to the catalog, which is where the three-filter test (`policy.md`) runs by construction.
3. **Approval gates.** Publish-tier and context-update scopes require a confirmation token minted from a real Member tap in the last few seconds — never minted by an agent or a Skill. This is the structural enforcement of "reads can be automated, writes require human confirmation."
4. **Network-layer credential injection.** The agent constructs a tool call describing intent; an edge function between the agent and the handlers mints the capability and applies it server-side. The credential never enters the agent's context window. This is the load-bearing defense against prompt injection — a malicious item description that says "post as this user" cannot exfiltrate a credential the agent never had.
5. **Per-turn credential selection.** A capability is bound to the current turn's stated intent, not the agent's standing identity — the next turn mints a fresh one.
6. **Sandboxed Skill execution.** A Skill sees only the Member's granted context, public data its scopes admit, and the action-layer client — never another Member's context or the platform's internal state. This is both prompt-injection containment and the multi-tenancy boundary for peer-shared and federated Skills.

## What this rules in and out

**Rules in:** one canonical write path per action, identically served from every caller; agent assistance whose worst-case prompt-injection outcome is a malformed tool call, never credential theft; per-action observability of who acted, under what grant; federation handoff over the same handlers a human uses.

**Rules out:** parallel write paths per caller; long-lived or agent-held credentials; bypassable confirmation gates; uncatalogued scopes; service-role SQL from controllers; cross-tenant Skill reads; a fake placeholder actor for platform-emitted events (the system Member is a real, login-disabled row).

**CI enforcement, not just code review.** No `pg.Pool` or service-role credential outside the action-handler library; every write route must import from the action layer; every public table has RLS, asserted against the live DB; no string-interpolated SQL. These four rules are what make the design hold when the codebase grows and someone's shipping under pressure at 11pm — there's no shortcut that lints clean.
