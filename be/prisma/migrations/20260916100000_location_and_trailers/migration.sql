ALTER TABLE "Movie"
ADD COLUMN "trailerKey" TEXT;

ALTER TABLE "Cinema"
ADD COLUMN "provinceCode" INTEGER NOT NULL DEFAULT 79;

CREATE INDEX "Cinema_provinceCode_idx" ON "Cinema"("provinceCode");

ALTER TABLE "Cinema"
ADD CONSTRAINT "Cinema_provinceCode_valid"
CHECK ("provinceCode" IN (1, 4, 8, 11, 12, 14, 15, 19, 20, 22, 24, 25, 31, 33, 37, 38, 40, 42, 44, 46, 48, 51, 52, 56, 66, 68, 75, 79, 80, 82, 86, 91, 92, 96));
