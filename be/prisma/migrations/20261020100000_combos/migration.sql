ALTER TYPE "AdminPermission" ADD VALUE 'MANAGE_COMBOS';
CREATE TABLE "Combo" (
 "id" TEXT PRIMARY KEY, "name" VARCHAR(120) NOT NULL, "description" VARCHAR(1000) NOT NULL,
 "imageUrl" VARCHAR(2048), "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "CinemaCombo" (
 "id" TEXT PRIMARY KEY, "cinemaId" TEXT NOT NULL REFERENCES "Cinema"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "comboId" TEXT NOT NULL REFERENCES "Combo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "price" DECIMAL(10,2) NOT NULL CHECK ("price" > 0), "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "CinemaCombo_cinemaId_comboId_key" ON "CinemaCombo"("cinemaId", "comboId");
CREATE TABLE "BookingComboItem" (
 "id" TEXT PRIMARY KEY, "bookingId" TEXT NOT NULL REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "cinemaComboId" TEXT NOT NULL, "name" VARCHAR(120) NOT NULL, "description" VARCHAR(1000) NOT NULL,
 "unitPrice" DECIMAL(10,2) NOT NULL CHECK ("unitPrice" > 0), "quantity" INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 10)
);
CREATE UNIQUE INDEX "BookingComboItem_bookingId_cinemaComboId_key" ON "BookingComboItem"("bookingId", "cinemaComboId");
