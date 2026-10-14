-- Sprint 5 keyset pagination indexes.
CREATE INDEX IF NOT EXISTS "Booking_userId_createdAt_id_idx" ON "Booking"("userId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "Booking_status_createdAt_id_idx" ON "Booking"("status", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "Ticket_bookingId_createdAt_id_idx" ON "Ticket"("bookingId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "SepayTransaction_status_transactionDate_id_idx" ON "SepayTransaction"("status", "transactionDate", "id");
