**Kind:** change
**Scenario:** F133
**Path:** well-worn
**Touches:** schema, RLS

## Architecture note
- New table `usage_daily` (day, part, members); no member id.
- RLS on, no client grants; read through admin_usage_daily(), gated on metrics.view.
- Written only by the usage.log handler.

**Visibility:** nobody reads the table directly; staff with metrics.view read through the function.
