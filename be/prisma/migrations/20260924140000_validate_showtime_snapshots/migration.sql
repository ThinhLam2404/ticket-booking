DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Showtime" AS showtime
    WHERE EXISTS (
      SELECT 1
      FROM "Seat" AS seat
      WHERE seat."roomId" = showtime."roomId"
        AND NOT EXISTS (
          SELECT 1
          FROM "ShowtimeSeat" AS showtimeSeat
          WHERE showtimeSeat."showtimeId" = showtime."id"
            AND showtimeSeat."seatId" = seat."id"
        )
    )
  ) THEN
    RAISE EXCEPTION 'Cannot finalize showtime pricing: one or more showtimes have an incomplete seat price snapshot';
  END IF;
END $$;
