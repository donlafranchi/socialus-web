### change #260 — add to calendar, and card images that say what they show

Don, 2026-09-30, from the "compare and fill" pass (#256). No migration.

- **Add to calendar:** a dated announcement on its Page, and a gathering's own page, get "Add to calendar". It downloads an `.ics` (`buildIcs`, RFC 5545) built from what the page already shows: title, start, an end only when there is one, place and link. It is never shown for an undated announcement.
- **Alt text:** Explore and venue-list card images had `alt=""`. They now default to the card's title, its date (posts with a start) and its place when shown (`cardImageAlt`). Signed out there is no place on the card (#252), so there is none in the alt either.
- `COPY.addToCalendar` is a placeholder.

Tests: the `.ics` builder and alt helper (unit), plus the link on announcements and gatherings and alt on both card kinds, each seen failing first. One older test asserting an empty alt is updated.
