CREATE TYPE "RoomFormat" AS ENUM ('STANDARD', 'IMAX', 'FOUR_DX', 'SCREEN_X');
CREATE TYPE "ShowtimeFormat" AS ENUM ('TWO_D_SUBTITLED', 'TWO_D_DUBBED', 'THREE_D_SUBTITLED', 'THREE_D_DUBBED');

ALTER TABLE "Room" ADD COLUMN "format" "RoomFormat" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Showtime" ADD COLUMN "format" "ShowtimeFormat" NOT NULL DEFAULT 'TWO_D_SUBTITLED';

UPDATE "Showtime" AS showtime
SET "basePrice" = prices.minimum_price
FROM (
  SELECT "showtimeId", MIN("price") AS minimum_price
  FROM "ShowtimeSeat"
  GROUP BY "showtimeId"
) AS prices
WHERE showtime."id" = prices."showtimeId"
  AND showtime."basePrice" IS NULL;

UPDATE "Showtime"
SET "vipMultiplier" = COALESCE("vipMultiplier", 1.10),
    "coupleMultiplier" = COALESCE("coupleMultiplier", 1.20)
WHERE "basePrice" IS NOT NULL;

CREATE INDEX "Showtime_format_startsAt_idx" ON "Showtime"("format", "startsAt");
CREATE INDEX "Room_format_idx" ON "Room"("format");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Showtime" WHERE "basePrice" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill Showtime.basePrice: one or more showtimes have no seat price snapshot';
  END IF;
END $$;

ALTER TABLE "Showtime" ALTER COLUMN "basePrice" SET NOT NULL;
ALTER TABLE "Showtime" ALTER COLUMN "vipMultiplier" SET NOT NULL;
ALTER TABLE "Showtime" ALTER COLUMN "coupleMultiplier" SET NOT NULL;
