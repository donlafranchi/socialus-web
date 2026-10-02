### change #293 — Pages get a business phone and weekly opening hours

Don, 2026-10-01: Pages carry a public business phone and weekly opening hours, the "rich yellow pages". Signed-in visitors only, per the front-door rule.

- **Schema:** `groups.contact_phone` (E.164, CHECK) and `groups.opening_hours` (jsonb object, CHECK). `groups` is granted column by column, so the two are granted to `authenticated` and to no one else. Three existing column guards now name them as signed-in-only exceptions, beside the founder and the anchor.
- **`group.update`** takes `contactPhone` (any US format, stored E.164, null clears it, anything else refused) and `openingHours` (validated: known days, HH:MM, closing after opening, split days allowed). The event names the fields, never the number.
- **Page:** a contact block for signed-in visitors with a tap-to-call link and the week's hours, today first. It renders only what the owner filled in. Signed out, the loader never reads them.
- **Edit Page:** a Contact section with the business phone and a seven-day hours editor, one range per day. A change counts as unsaved.
- **`src/lib/phone.ts`:** US phone parsing and display, shared with the signup code (#282).

Tests: `tests/page-contact-db.test.ts` (each check seen failing: without the grant, with an anon grant, without the CHECKs), plus helper, handler, loader, block, editor and form tests, each seen failing first. **Migration: `20261001110000_page_phone_hours.sql`.** Apply after #281, before #284.
