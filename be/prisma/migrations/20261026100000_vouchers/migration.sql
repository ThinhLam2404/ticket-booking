ALTER TYPE "AdminPermission" ADD VALUE 'MANAGE_VOUCHERS';

ALTER TABLE "Booking" ADD COLUMN "voucherCode" TEXT;

CREATE TYPE "VoucherDiscountType" AS ENUM ('FIXED', 'PERCENT');
CREATE TYPE "VoucherScope" AS ENUM ('TICKETS', 'COMBOS', 'ORDER');
CREATE TYPE "VoucherRedemptionStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

CREATE TABLE "Voucher" (
  "id" TEXT PRIMARY KEY,
  "code" VARCHAR(64) NOT NULL UNIQUE,
  "discountType" "VoucherDiscountType" NOT NULL,
  "scope" "VoucherScope" NOT NULL,
  "value" DECIMAL(10,2) NOT NULL,
  "minimumSpend" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "maximumDiscount" DECIMAL(10,2),
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "defaultUsageLimit" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "VoucherCinema" (
  "voucherId" TEXT NOT NULL REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "cinemaId" TEXT NOT NULL REFERENCES "Cinema"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("voucherId", "cinemaId")
);

CREATE TABLE "VoucherAssignment" (
  "id" TEXT PRIMARY KEY,
  "voucherId" TEXT NOT NULL REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "usageLimit" INTEGER NOT NULL DEFAULT 1,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoucherAssignment_usageLimit_check" CHECK ("usageLimit" > 0)
);
CREATE UNIQUE INDEX "VoucherAssignment_voucherId_userId_key" ON "VoucherAssignment"("voucherId", "userId");
CREATE INDEX "VoucherAssignment_userId_assignedAt_idx" ON "VoucherAssignment"("userId", "assignedAt");

CREATE TABLE "VoucherRedemption" (
  "id" TEXT PRIMARY KEY,
  "voucherId" TEXT NOT NULL REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "assignmentId" TEXT NOT NULL REFERENCES "VoucherAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "bookingId" TEXT NOT NULL UNIQUE REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "VoucherRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
  "codeSnapshot" TEXT NOT NULL,
  "revisionSnapshot" INTEGER NOT NULL,
  "discountAmount" DECIMAL(10,2) NOT NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "releaseReason" TEXT
);

CREATE INDEX "Voucher_active_startsAt_endsAt_idx" ON "Voucher"("active", "startsAt", "endsAt");
CREATE INDEX "VoucherCinema_cinemaId_idx" ON "VoucherCinema"("cinemaId");
CREATE INDEX "VoucherRedemption_voucherId_status_idx" ON "VoucherRedemption"("voucherId", "status");
CREATE INDEX "VoucherRedemption_assignmentId_status_idx" ON "VoucherRedemption"("assignmentId", "status");
CREATE INDEX "VoucherRedemption_voucherId_userId_status_idx" ON "VoucherRedemption"("voucherId", "userId", "status");
CREATE INDEX "VoucherRedemption_userId_status_idx" ON "VoucherRedemption"("userId", "status");

ALTER TABLE "Voucher"
  ADD CONSTRAINT "Voucher_value_check" CHECK ("value" >= 0),
  ADD CONSTRAINT "Voucher_minimumSpend_check" CHECK ("minimumSpend" >= 0),
  ADD CONSTRAINT "Voucher_maximumDiscount_check" CHECK ("maximumDiscount" IS NULL OR "maximumDiscount" >= 0),
  ADD CONSTRAINT "Voucher_dates_check" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "Voucher_revision_check" CHECK ("revision" > 0);

ALTER TABLE "VoucherRedemption"
  ADD CONSTRAINT "VoucherRedemption_discountAmount_check" CHECK ("discountAmount" >= 0);
