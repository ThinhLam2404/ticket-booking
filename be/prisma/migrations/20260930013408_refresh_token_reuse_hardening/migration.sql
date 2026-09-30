-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "familyId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "replacedByJti" TEXT,
ADD COLUMN     "reuseDetectedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_revokedAt_idx" ON "RefreshToken"("familyId", "revokedAt");
