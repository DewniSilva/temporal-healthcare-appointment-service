-- Replaces the flat AppointmentStatus enum with the full lifecycle state
-- machine, adds an independent ReservationStatus to SlotReservation, replaces
-- Notification with the richer Reminder model (CONFIRMATION_REMINDER /
-- UPCOMING_REMINDER only -- the old immediate BOOKING_CONFIRMATION email is
-- retired, it is not part of the new reminder model), and adds AuditLog.
--
-- This is a local/demo database (see prisma/seed.ts); existing Notification
-- rows are dropped rather than migrated, since the old single generic
-- "reminder" type has no principled mapping onto the new confirmation vs.
-- upcoming distinction.

-- ── Appointment.status: PENDING -> REQUESTED, everything else keeps its name ──
ALTER TABLE "Appointment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Appointment" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
DROP TYPE "AppointmentStatus";
CREATE TYPE "AppointmentStatus" AS ENUM (
  'REQUESTED', 'RESERVING', 'BOOKED', 'CONFIRMED', 'NO_RESPONSE',
  'CANCELLED', 'COMPLETED', 'NO_SHOW', 'REJECTED', 'BOOKING_FAILED'
);
UPDATE "Appointment" SET "status" = 'REQUESTED' WHERE "status" = 'PENDING';
ALTER TABLE "Appointment"
  ALTER COLUMN "status" TYPE "AppointmentStatus" USING "status"::"AppointmentStatus",
  ALTER COLUMN "status" SET DEFAULT 'REQUESTED';

ALTER TABLE "Appointment"
  ADD COLUMN "appointmentTzOffsetMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ALTER COLUMN "appointmentTzOffsetMinutes" DROP DEFAULT;

-- ── SlotReservation: add its own ReservationStatus ──
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVING', 'RESERVED', 'RELEASED', 'CONFLICTED');

ALTER TABLE "SlotReservation"
  ADD COLUMN "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVING',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Rows that already exist represent reservations that are, in fact, active.
UPDATE "SlotReservation" SET "status" = 'RESERVED';

CREATE INDEX "SlotReservation_status_idx" ON "SlotReservation"("status");

-- The 20-minute exclusion constraint from the previous migration guarded
-- every row unconditionally. Two independent reservation attempts (two
-- RESERVING rows for the same doctor/time, one per appointmentId) must be
-- allowed to exist simultaneously -- only one may ever win the transition to
-- RESERVED, which is what this constraint now actually protects.
ALTER TABLE "SlotReservation" DROP CONSTRAINT "SlotReservation_doctor_20_minute_excl";
ALTER TABLE "SlotReservation"
  ADD CONSTRAINT "SlotReservation_doctor_20_minute_excl"
  EXCLUDE USING gist (
    "doctorId" WITH =,
    tsrange("appointmentTime", "appointmentTime" + INTERVAL '20 minutes', '[)') WITH &&
  )
  WHERE ("overlapProtected" AND "status" = 'RESERVED');

ALTER TABLE "SlotReservation"
  ADD CONSTRAINT "SlotReservation_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Reminder replaces Notification ──
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_appointmentId_fkey";
DROP TABLE "Notification";
DROP TYPE "NotificationType";
DROP TYPE "NotificationStatus";

CREATE TYPE "ReminderType" AS ENUM ('CONFIRMATION_REMINDER', 'UPCOMING_REMINDER');
CREATE TYPE "ReminderStatus" AS ENUM (
  'SCHEDULED', 'PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'CANCELLED'
);

CREATE TABLE "Reminder" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "type" "ReminderType" NOT NULL,
  "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
  "idempotencyKey" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Reminder_idempotencyKey_key" ON "Reminder"("idempotencyKey");
CREATE UNIQUE INDEX "Reminder_appointmentId_type_key" ON "Reminder"("appointmentId", "type");
CREATE INDEX "Reminder_status_idx" ON "Reminder"("status");
ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── AuditLog ──
CREATE TYPE "ActorRole" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN', 'SYSTEM');

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorRole" "ActorRole" NOT NULL,
  "action" TEXT NOT NULL,
  "previousState" TEXT,
  "newState" TEXT NOT NULL,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_appointmentId_idx" ON "AuditLog"("appointmentId");
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
