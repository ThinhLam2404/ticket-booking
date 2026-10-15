CREATE TYPE "AdminPermission" AS ENUM ('MANAGE_MOVIES', 'MANAGE_CINEMAS', 'MANAGE_SHOWTIMES', 'VIEW_BOOKINGS', 'MANAGE_PAYMENTS', 'VIEW_SYSTEM', 'MANAGE_USERS', 'VIEW_AUDIT_LOGS');

CREATE TABLE "UserAdminPermission" (
    "userId" TEXT NOT NULL,
    "permission" "AdminPermission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAdminPermission_pkey" PRIMARY KEY ("userId", "permission"),
    CONSTRAINT "UserAdminPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserAdminPermission_permission_idx" ON "UserAdminPermission"("permission");
INSERT INTO "UserAdminPermission" ("userId", "permission")
SELECT u."id", p."permission"::"AdminPermission"
FROM "User" u
CROSS JOIN (VALUES
  ('MANAGE_MOVIES'), ('MANAGE_CINEMAS'), ('MANAGE_SHOWTIMES'), ('VIEW_BOOKINGS'),
  ('MANAGE_PAYMENTS'), ('VIEW_SYSTEM'), ('MANAGE_USERS'), ('VIEW_AUDIT_LOGS')
) AS p("permission")
WHERE u."role" = 'ADMIN'
ON CONFLICT DO NOTHING;

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX "AuditLog_resourceType_resourceId_createdAt_idx" ON "AuditLog"("resourceType", "resourceId", "createdAt");
