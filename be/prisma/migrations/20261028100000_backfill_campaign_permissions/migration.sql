-- Existing admins were created before the campaign permissions were added to the enum.
-- Backfill both permissions so the existing admin UI does not fail with 403.
INSERT INTO "UserAdminPermission" ("userId", "permission")
SELECT u."id", p."permission"::"AdminPermission"
FROM "User" u
CROSS JOIN (VALUES ('MANAGE_COMBOS'), ('MANAGE_VOUCHERS')) AS p("permission")
WHERE u."role" = 'ADMIN'
ON CONFLICT ("userId", "permission") DO NOTHING;
