# Staff roles and permissions (#544)

Who on the staff may open or do what. Roles are named sets of permissions; people hold roles.

| Role | Permissions |
|---|---|
| owner | all, including `staff.manage` |
| moderator | `reports.review`, `tags.review`, `unclaimed.manage` |
| analyst | `metrics.view` |
| support | `unclaimed.manage` |

Permissions: `metrics.view`, `reports.review`, `tags.review`, `builders.manage`, `unclaimed.manage`, `staff.manage`.

**Where it is enforced (three places, so a missing button is never the only lock):**
1. `/admin/*` layout and each page (`src/lib/staff/page-guard.ts`): a member without the permission gets the 404 of an address that is not there.
2. Server actions (`src/actions/_lib/staff.ts`): `requirePermission(ctx, 'tags.review', verb)`; a database error refuses.
3. The database: the role tables are readable by no member; `staff_can(permission)` answers only about the caller; `admin_metrics_weekly` returns no rows without `metrics.view`.

**The owner's break-glass:** `OPERATOR_MEMBER_ID` still holds every permission with no database row, so a bad grant cannot lock the owner out. Everyone else needs an assignment.

**Granting a role** (until `/admin/staff` exists): Actions → "Staff roles" → Run workflow → action, member id, role; or `tsx scripts/staff/grant-role.ts grant <member-uuid> <role>`. A revoke keeps the row as the record.

**Adding a permission:** one row in `staff_permissions`, one in `staff_role_permissions` for each role that gets it, the name in `PERMISSIONS` (`src/lib/staff/permissions.ts`), and a `requirePermission` / `requirePagePermission` at the door. **A new role** is one row in `staff_roles` plus its permissions: no code change.

**Metrics privacy:** staff see real counts (Don, 2026-10-09). Member-to-member privacy is unchanged. No screen lists, ranks or singles out a member; abuse is handled by culture and by who holds `metrics.view`.
