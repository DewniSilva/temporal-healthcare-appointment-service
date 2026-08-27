-- btree_gist supplies GiST equality for the doctor's text ID so it can be
-- combined with a timestamp range overlap operator in one exclusion rule.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Preserve legacy demo reservations, some of which predate the 20-minute slot
-- policy and overlap each other. Every reservation created after this migration
-- is protected by the exclusion constraint. Application preflight checks still
-- consider legacy reservations, so new bookings cannot overlap them.
ALTER TABLE "SlotReservation"
  ADD COLUMN "overlapProtected" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SlotReservation"
  ALTER COLUMN "overlapProtected" SET DEFAULT true;

ALTER TABLE "SlotReservation"
  ADD CONSTRAINT "SlotReservation_doctor_20_minute_excl"
  EXCLUDE USING gist (
    "doctorId" WITH =,
    tsrange("appointmentTime", "appointmentTime" + INTERVAL '20 minutes', '[)') WITH &&
  )
  WHERE ("overlapProtected");
