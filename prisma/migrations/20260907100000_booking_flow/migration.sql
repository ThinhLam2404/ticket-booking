-- CreateEnum
CREATE TYPE "ShowtimeSeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'SOLD');

-- AlterTable
ALTER TABLE "ShowtimeSeat"
ADD COLUMN "status" "ShowtimeSeatStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN "heldUntil" TIMESTAMP(3),
ADD COLUMN "heldByBookingId" TEXT;

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "holdToken" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestHash" TEXT;

-- AlterTable
ALTER TABLE "Payment"
ADD COLUMN "idempotencyKey" TEXT;

UPDATE "Booking"
SET "holdToken" = 'legacy-' || "id"
WHERE "holdToken" IS NULL;

ALTER TABLE "Booking"
ALTER COLUMN "holdToken" SET NOT NULL;

UPDATE "Booking"
SET "status" = 'EXPIRED'
WHERE "status" = 'PENDING'
  AND "expiresAt" <= CURRENT_TIMESTAMP;

UPDATE "Payment" p
SET "status" = 'FAILED'
WHERE "status" = 'PENDING'
  AND EXISTS (
    SELECT 1
    FROM "Booking" b
    WHERE b."id" = p."bookingId"
      AND b."status" IN ('CANCELLED', 'EXPIRED')
  );

UPDATE "ShowtimeSeat" ss
SET "status" = 'SOLD',
    "heldUntil" = NULL,
    "heldByBookingId" = NULL
WHERE EXISTS (
  SELECT 1
  FROM "BookingItem" bi
  INNER JOIN "Booking" b ON b."id" = bi."bookingId"
  WHERE bi."showtimeSeatId" = ss."id"
    AND b."status" = 'CONFIRMED'
);

UPDATE "ShowtimeSeat" ss
SET "status" = 'HELD',
    "heldUntil" = b."expiresAt",
    "heldByBookingId" = b."id"
FROM "BookingItem" bi
INNER JOIN "Booking" b ON b."id" = bi."bookingId"
WHERE bi."showtimeSeatId" = ss."id"
  AND b."status" = 'PENDING'
  AND b."expiresAt" > CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- DropIndex
DROP INDEX "BookingItem_showtimeSeatId_key";

-- CreateIndex
CREATE INDEX "ShowtimeSeat_showtimeId_status_idx" ON "ShowtimeSeat"("showtimeId", "status");

-- CreateIndex
CREATE INDEX "ShowtimeSeat_heldByBookingId_idx" ON "ShowtimeSeat"("heldByBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_userId_idempotencyKey_key" ON "Booking"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BookingItem_bookingId_showtimeSeatId_key" ON "BookingItem"("bookingId", "showtimeSeatId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateConstraint
ALTER TABLE "Showtime"
ADD CONSTRAINT "Showtime_time_order_check"
CHECK ("startsAt" < "endsAt");

-- CreateConstraint
ALTER TABLE "ShowtimeSeat"
ADD CONSTRAINT "ShowtimeSeat_hold_state_check"
CHECK (
  ("status" = 'HELD' AND "heldUntil" IS NOT NULL AND "heldByBookingId" IS NOT NULL)
  OR
  ("status" <> 'HELD' AND "heldUntil" IS NULL AND "heldByBookingId" IS NULL)
);

-- CreateConstraint
ALTER TABLE "ShowtimeSeat"
ADD CONSTRAINT "ShowtimeSeat_price_check"
CHECK ("price" >= 0);

-- CreateConstraint
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_total_amount_check"
CHECK ("totalAmount" >= 0);

-- CreateConstraint
ALTER TABLE "BookingItem"
ADD CONSTRAINT "BookingItem_price_check"
CHECK ("price" >= 0);

-- CreateConstraint
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_amount_check"
CHECK ("amount" >= 0);

-- CreateConstraint
ALTER TABLE "Showtime"
ADD CONSTRAINT "Showtime_room_time_exclusion"
EXCLUDE USING gist (
  "roomId" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
);

-- CreateIndex
CREATE INDEX "Booking_holdToken_idx" ON "Booking"("holdToken");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_jti_key" ON "RefreshToken"("jti");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "ShowtimeSeat"
ADD CONSTRAINT "ShowtimeSeat_heldByBookingId_fkey"
FOREIGN KEY ("heldByBookingId") REFERENCES "Booking"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken"
ADD CONSTRAINT "RefreshToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
