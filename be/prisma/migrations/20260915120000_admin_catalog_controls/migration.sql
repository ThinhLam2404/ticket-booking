ALTER TABLE "Movie"
ADD COLUMN "posterUrl" TEXT,
ADD COLUMN "backdropUrl" TEXT;

ALTER TABLE "Showtime"
ADD COLUMN "basePrice" DECIMAL(10,2),
ADD COLUMN "vipMultiplier" DECIMAL(5,2),
ADD COLUMN "coupleMultiplier" DECIMAL(5,2);

ALTER TABLE "Showtime"
ADD CONSTRAINT "Showtime_pricing_check" CHECK (
  ("basePrice" IS NULL OR "basePrice" >= 0)
  AND ("vipMultiplier" IS NULL OR "vipMultiplier" >= 0)
  AND ("coupleMultiplier" IS NULL OR "coupleMultiplier" >= 0)
);
