# Review rules

**As of 2026-10-26** · Source: socialus-ops `process/PIPELINE.md` § A reviewer's first pass, the PM's UX rulings of 2026-10-04 to 10-06 · Maintained by: hand (code agent)

What a reviewer of a pull request flags, at what severity, and what it skips. Read by the second session that reviews a PR (`/code-review`, a reviewer subagent, or a hosted review), never by the session that wrote the code. Findings go on the PR as a GitHub review with `file:line` evidence, not into the PR body. Why a separate reviewer: a gate judged by the party it constrains is waived; PR #990 (2026-10-21) passed the old body-text check with the builder as its own reviewer.

## Always flag (blocking)

- **A ruling broken.** Behaviour or copy against `socialus-plan/constraints/code.md` or the cited scenario's Acceptance. Cite the ruling.
- **Who sees what.** Any read a persona should not have (signed out, member, owner, operator, builder) against `evals/visibility/matrix.ts`; a string that carries data (a count, a name, an address) on a surface that withholds it. Any change under `supabase/` or `src/actions/` gets this check.
- **A criterion with no test** seen failing, on a scenario PR (`[guards F###.n]` markers).
- **A test weakened, skipped or quarantined** to get green.
- **Secrets, service-role use in the app, a migration that cannot apply from scratch.**

## Flag as important (fix before merge on a UI PR)

The PM's UX checklist (2026-10-05, tidy lines 2026-10-06), applied to every changed surface at 390 and 1280 as each affected persona. Run the app for it; CI captures no pictures per PR (the PM, 2026-10-27), and the full screenshot matrix is Actions → CI → Run workflow → full, for a redesign:

- WCAG 2.1 AA: contrast through the colour tokens, visible focus in a logical order, every control labelled, alt text, tap targets at least 44px.
- Every state present: empty, loading, error, offline or slow, signed out.
- One primary action per screen; the main action within thumb reach on a phone.
- No horizontal scroll at 390, including vocabularies that grow (pills, tabs, filters).
- Copy follows `socialus-plan product/foundation/voice-and-tone.md`; no em dashes; US spelling.
- Nielsen: status visible, a way back or undo, consistent with the rest of the app, errors prevented before explained.
- Tidy and contained: related information in its own card or section with a header; one action affordance per card, in the header; nothing floating loose; long or rarely used content collapsed.
- Tidiness verdict, one line: "Is this screen neat, tidy and organized? What is the one thing that looks most cluttered?"
- A departure from the precedents listed on the Issue's `Path:` line, unexplained.

## Skip

- Anything CI already enforces: types, lint, build, the migration checks, the visibility matrix rows that already pass.
- Generated files (`src/ontology/registry.json`, `build-log/reports/`).
- Style preferences with no rule behind them. At most 5 nits per review, each labelled nit.

## Leave for the PM

New or changed member-facing copy (tone), a judgement-word criterion (*clear*, *easy*), and any case no ruling covers: list each in one line at the end of the review as "Judgement call for the PM".
