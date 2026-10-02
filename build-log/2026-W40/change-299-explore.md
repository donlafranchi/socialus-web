### change #299 — Explore on the new layout (L01–L05), first pass

- **Default art (Card, L01):** a card without a photo shows one of PersonMark's four neutral tones, chosen by the Page's id so it never changes, and its kind's icon (shop, service or group). No new colours. The 🌱 is gone from Explore.
- **Loading (L01):** a skeleton of the search row and six cards, announced once, with the shimmer stilled for reduced motion. It replaces "Loading…".
- **Split view:** list 55%, map 45% from 1024, as the template draws it. The pill under 1024 and the seam control (#279) are unchanged.
- **L02 filter sheet and L03 area picker** are already on the shared sheet (#297). **L04 not-covered panel** sits inside the area picker. **L05 waitlist count** moves onto the shared sheet here.
- **Not here:** the map pin's peek card on phone (today's popup stays) and the search row's "Pages and events" scope control, which needs a ruling.

Tests: default art, the card without a photo (seen failing against the old card) and the skeleton, each seen failing first. No migration.
