# change #363 — Page types: Business or Social group

- Ruled 2026-10-05: every Page is an organization, its two types are Business and Social group, and the use cases are presets. Stored in the existing groups.kind: business, or the social preset (interest, event_anchored, practice, place, family). No migration.
- Create's three questions are presets: business, a group or meetup (interest), an organization that holds events (event_anchored).
- Settings: a "Type of Page" sheet. group.update and update_draft take `pageKind`, swap the managing role (owner ↔ steward), keep a social preset, and add a group_businesses row for a new business.
- The Page leads by preset: a business with contact; a group with Join and its next event; an organization with its upcoming events. Social groups list no Products & services.
- The kind line ("Business · Bakery", "Social group") under the name, on the Page and on Explore cards.
- The `kind='business'` readers (resolve-product, resolve-service, resolve-venue-items, getDraftGroup) serve business-only features; unchanged.
