-- Preserve the payable total of every historical booking. Existing bookings
-- predate combo/voucher support, so their whole total belongs to tickets.
ALTER TABLE "Booking"
  ADD COLUMN "ticketSubtotal" DECIMAL(10,2),
  ADD COLUMN "comboSubtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "pricingVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "Booking" SET "ticketSubtotal" = "totalAmount";

ALTER TABLE "Booking"
  ALTER COLUMN "ticketSubtotal" SET NOT NULL,
  ADD CONSTRAINT "Booking_price_breakdown_check" CHECK (
    "ticketSubtotal" >= 0 AND "comboSubtotal" >= 0 AND
    "discountAmount" >= 0 AND
    "discountAmount" <= "ticketSubtotal" + "comboSubtotal" AND
    "totalAmount" = "ticketSubtotal" + "comboSubtotal" - "discountAmount"
  ),
  ADD CONSTRAINT "Booking_pricing_version_check" CHECK ("pricingVersion" >= 1);
