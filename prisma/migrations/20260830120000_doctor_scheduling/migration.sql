-- Per-doctor recurring schedules, one-off exceptions, and clinic-wide
-- closures, replacing the previous hardcoded global working-hours check.
-- Existing Appointment/SlotReservation/Reminder/AuditLog rows are untouched.

CREATE TYPE "DoctorScheduleExceptionType" AS ENUM ('UNAVAILABLE', 'CUSTOM_HOURS');

CREATE TABLE "DoctorAvailability" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DoctorAvailability_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DoctorAvailability_doctorId_dayOfWeek_idx" ON "DoctorAvailability"("doctorId", "dayOfWeek");
ALTER TABLE "DoctorAvailability"
  ADD CONSTRAINT "DoctorAvailability_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DoctorScheduleException" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "type" "DoctorScheduleExceptionType" NOT NULL,
  "startTime" TEXT,
  "endTime" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DoctorScheduleException_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DoctorScheduleException_doctorId_date_key" ON "DoctorScheduleException"("doctorId", "date");
ALTER TABLE "DoctorScheduleException"
  ADD CONSTRAINT "DoctorScheduleException_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ClinicClosure" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "isClosed" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicClosure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClinicClosure_date_key" ON "ClinicClosure"("date");
