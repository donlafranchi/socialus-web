# Test / Eval Checklist

Manual and automated checks before shipping. Run through this before any deploy.

## Automated (must pass)

```bash
npm run test       # Unit tests
npm run lint       # Linting
npm run build      # Build succeeds
npm run eval       # Playwright evals
```

## Manual Smoke Tests

### Auth

- [ ] Sign up with email works
- [ ] Login with email works
- [ ] Sign out clears session
- [ ] Protected routes redirect to login
- [ ] Session persists on page refresh

### Cross-Cutting

- [ ] Mobile viewport (390x844) — no horizontal scroll, all UI reachable
- [ ] No console errors in normal flows
- [ ] Loading states shown during async operations
- [ ] Network errors show user-friendly messages
- [ ] No exposed API keys in client bundle (`npm run build` then inspect output)

## Playwright Eval Coverage

### Features

| Feature | Spec File | What It Tests |
|---------|-----------|---------------|
| F030 | `features/F030-newcomer-signs-up-and-lands-in-feed.spec.ts` | Locality-defaulted feed, signup, empty-state widen |
| F032 | `features/F032-viewer-finds-member-page-and-follows.spec.ts` | Member page read, follow routing through sign-in |
| F033 | `features/F033-viewer-finds-venue-page.spec.ts` | Anonymous venue page read |
| F034 | `features/F034-member-hosts-recurring-gathering.spec.ts` | Recurring gathering Item page, Group and Member-hosted paths |
| F035 | `features/F035-rosa-finds-mayas-shop.spec.ts` | Shop page header, "Claimed local owner" badge |
| F036 | `features/F036-member-creates-business-group-via-sell-walkthrough.spec.ts` | Sell CTA on `/you`, Group + founder membership in one transaction |
| F037 | `features/F037-maya-claims-locally-owned.spec.ts` | Locally-owned jurisdiction claim |
| F038 | `features/F038-producer-lists-product.spec.ts` | Product Item page, Group attribution, pickup |
| F040 | `features/F040-producer-lists-service.spec.ts` | Service Item page, brand resolve-up, service area, rate |
| F041 | `features/F041-producer-generates-qr-card.spec.ts` | QR card affordance, owner-only gating |
| F042 | `features/F042-member-follows-producer-group-venue.spec.ts` | Following summary on `/you`, full list at `/you/following` |

### Substrate floor

`phase-0/floor.spec.ts` and the thirteen `phase-1/*.spec.ts` specs assert the schema
floor — places, items, groups, locations, members, follows, saved searches,
agent-assistance, place routing, reverse geocode, and the `discoverable_items`
materialized view. They gate every migration; run them with the feature specs.
