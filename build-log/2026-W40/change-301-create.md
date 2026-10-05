### change #301 — Create is one question, landing on the draft Page; Before you publish (L10, L14)

Ruled 2026-10-01 (relayed by Cowork). Replaces the multi-step create walkthrough, which is unlinked, not edited (stop note).

- **`/create` (L10):** "What are you starting?" Opening a shop, offering a service, or creating a group for meetups (business, practice and interest). One answer, then **Start** makes a draft of that kind and nothing else, and lands on the draft Page in the owner view. Create in the nav points here. Signed out, it goes to sign-in and comes back.
- **Draft Page (L14):** "Draft · only you can see this", a title naming the kind ("Your new shop") until there's a name, and **Before you publish**: name, where it is, description, and an optional photo. Each has an Add/Change link to Edit, and Publish waits for the three. The "Resume walkthrough" link is gone.
- **Edit serves drafts:** a draft saves through `group.update_draft`, a live Page through `group.update`.
- **Publishing (`group.activate`)** needs, for every kind, a name (not the placeholder), where it is (the anchor: address or area) and a description. **Tags are optional at publish** (T159's at-least-one-tag rule is superseded; tags stay editable, #285).
- **No migration.** Drafts already took a kind alone; the Issue's note was corrected.
- **Not here:** the rules agreement (F082) before going live. It isn't built; Publish publishes.

Tests: publish rules, the question, the draft action, the checklist, the draft Page, draft editing and the nav, each seen failing first. Checked locally end to end: sign in, Create, a shop, the draft with its checklist, Edit, save.
