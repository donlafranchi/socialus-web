# change #363 — Page kinds: Business, Group, Organization

- Create offers the three; stored in the existing groups.kind (business / interest / event_anchored). No migration.
- Settings: a "Kind of Page" sheet; group.update and update_draft take `pageKind` and swap the managing role (owner ↔ steward), adding a group_businesses row for a new business.
- The Page leads by kind: a business with contact; a group with Join and its next meetup, no Products & services; an organization with its upcoming events.
- The kind line under the name, on the Page and on Explore cards.
- The `kind='business'` readers (resolve-product, resolve-service, resolve-venue-items, getDraftGroup) serve business-only features; unchanged.
