import { prisma } from '../../shared/database/prisma';
import { APPOINTMENT_SLOT_MS } from '../../shared/appointmentSlots';
import { calendarDateDayOfWeek, nextCalendarDate, zonedWallClockToUtc } from '../../shared/scheduling/timezone';
import type { AvailabilityInput, BlockingInterval, ScheduleException } from '../../shared/scheduling/availability.types';

/** "YYYY-MM-DD" string -> a plain Postgres DATE value (midnight UTC), matching how DoctorScheduleException/ClinicClosure store `date`. */
function toDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export const schedulingRepository = {
  /**
   * Fetches everything computeAvailableSlots needs for one doctor and one
   * clinic-local calendar date: active recurring windows for that weekday,
   * that date's exception (if any), whether the clinic is closed, and
   * existing reservations spanning the date's full clinic-local day (queried
   * by its UTC span so a window near local midnight is still covered).
   */
  async getAvailabilityContext(doctorId: string, date: string, timeZone: string): Promise<Omit<AvailabilityInput, 'durationMinutes'>> {
    const dayOfWeek = calendarDateDayOfWeek(date);
    const dateOnly = toDateOnly(date);
    const dayStartUtc = zonedWallClockToUtc(date, '00:00', timeZone);
    const dayEndUtc = zonedWallClockToUtc(nextCalendarDate(date), '00:00', timeZone);

    const [availabilityRows, exceptionRow, closureRow, reservationRows] = await Promise.all([
      prisma.doctorAvailability.findMany({
        where: { doctorId, dayOfWeek, isActive: true },
        select: { startTime: true, endTime: true }
      }),
      prisma.doctorScheduleException.findUnique({
        where: { doctorId_date: { doctorId, date: dateOnly } },
        select: { type: true, startTime: true, endTime: true }
      }),
      prisma.clinicClosure.findUnique({ where: { date: dateOnly }, select: { isClosed: true } }),
      prisma.slotReservation.findMany({
        where: { doctorId, status: { in: ['RESERVING', 'RESERVED'] }, appointmentTime: { gte: dayStartUtc, lt: dayEndUtc } },
        select: { appointmentTime: true }
      })
    ]);

    const exception: ScheduleException | null = exceptionRow
      ? { type: exceptionRow.type, startTime: exceptionRow.startTime, endTime: exceptionRow.endTime }
      : null;

    const blockingIntervals: BlockingInterval[] = reservationRows.map((row) => ({
      startAt: row.appointmentTime.toISOString(),
      // The reservation's own duration (APPOINTMENT_SLOT_MINUTES) is a global
      // constant, not something this table stores directly — the caller
      // (validateBooking) already knows it and passes it back in for slot
      // generation; here we only need each existing reservation's *start*,
      // widened by the same fixed duration so it blocks correctly regardless
      // of the caller's own requested duration.
      endAt: new Date(row.appointmentTime.getTime() + APPOINTMENT_SLOT_MS).toISOString()
    }));

    return {
      date,
      timeZone,
      recurringWindows: availabilityRows,
      exception,
      clinicClosed: closureRow?.isClosed ?? false,
      blockingIntervals
    };
  }
};
