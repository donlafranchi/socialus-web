# Design archive — the /you cards, as they were

**Reference only. This branch is never merged to main.**

Don asked to see how the `/you` cards looked before the vendor deletion, so the
design language can be reused elsewhere. Nothing here is product.

## How to look at it

The rendered page is `/design-archive` on this branch's Vercel preview. That is
the thing to look at — it shows the cards with placeholder content rather than
asking anyone to read JSX.

## What is in `recovered/`

The original source files, saved as `.txt` so they are archived rather than
compiled. They import types, hooks and database tables that no longer exist, so
they cannot build and are not meant to.

| File | Recovered from |
|---|---|
| `components__VendorCard.tsx.txt` | `ccbf54d` — main immediately before #124 |
| `components__BulletinFeedCard.tsx.txt` | `ccbf54d` |
| `components__OwnershipBadge.tsx.txt` | `ccbf54d` |
| `components__RecruitmentGrid.tsx.txt` | `ccbf54d` |
| `components__SupportButton.tsx.txt` | `ccbf54d` |
| `app__you__page.tsx.txt` | `ccbf54d` |
| `app__you__vendor__page.tsx.txt` | `ccbf54d` |
| `app__vendors__[slug]__VendorProfilePage.tsx.txt` | `ccbf54d` |
| `components__BusinessDetailCard.tsx.txt` | `4db3670` — before #125 removed it |

## Visual only

Every card here read a table that does not exist and never did: `vendors`,
`businesses`, `follows`, `supports`, `vendor_bulletins`, `vendor_stats_daily`,
`markets`, `market_vendors`, `bulletin_mutes`. They rendered empty in the
running app.

**The design was real work. The wiring under it was not there.** That is the
distinction worth carrying forward — these are shapes to reuse, not features
that were lost.
