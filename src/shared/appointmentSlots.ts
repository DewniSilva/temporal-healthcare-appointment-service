export const APPOINTMENT_SLOT_MINUTES = 20;
export const APPOINTMENT_SLOT_MS = APPOINTMENT_SLOT_MINUTES * 60_000;

const offsetDateTimeParts = /T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const offsetSuffix = /(Z|[+-])(\d{2}):(\d{2})$/;

function parseWallClockTime(appointmentTime: string): { hour: number; minute: number; second: number } | null {
  const match = offsetDateTimeParts.exec(appointmentTime);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3]) };
}

/** Validates the wall-clock time selected by the caller, before UTC conversion. */
export function isAlignedAppointmentSlot(appointmentTime: string): boolean {
  const parts = parseWallClockTime(appointmentTime);
  if (!parts) return false;
  return parts.second === 0 && parts.minute % APPOINTMENT_SLOT_MINUTES === 0;
}

// Per-doctor working-hours legality (DoctorAvailability/exceptions/clinic
// closures) lives in shared/scheduling/availability.ts — there is no longer
// a single global working-hours rule to check here.

/** Captures the wall-clock UTC offset (minutes) from an offset-qualified ISO datetime string, e.g. "+05:30" -> 330, "Z" -> 0. */
export function extractTzOffsetMinutes(appointmentTime: string): number {
  const match = offsetSuffix.exec(appointmentTime);
  if (!match || match[1] === 'Z') return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * Existing 20-minute reservation [existingStart, existingStart + 20m) overlaps
 * a requested [start, start + 20m) exactly when its start is inside this open
 * interval. Adjacent slots at either boundary remain available.
 */
export function appointmentOverlapWindow(appointmentTime: string | Date): { after: Date; before: Date } {
  const start = appointmentTime instanceof Date ? appointmentTime : new Date(appointmentTime);
  return {
    after: new Date(start.getTime() - APPOINTMENT_SLOT_MS),
    before: new Date(start.getTime() + APPOINTMENT_SLOT_MS)
  };
}
