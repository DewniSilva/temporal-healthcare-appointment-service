export const APPOINTMENT_SLOT_MINUTES = 20;
export const APPOINTMENT_SLOT_MS = APPOINTMENT_SLOT_MINUTES * 60_000;

const offsetDateTimeParts = /T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// 7:00 AM–12:00 PM and 1:00 PM–5:00 PM, by the caller's wall-clock hour.
const WORKING_HOUR_RANGES: Array<{ startHour: number; endHour: number }> = [
  { startHour: 7, endHour: 12 },
  { startHour: 13, endHour: 17 }
];

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

/** Restricts bookings to working hours (7 AM–12 PM, 1 PM–5 PM), by the caller's wall-clock hour. */
export function isWithinWorkingHours(appointmentTime: string): boolean {
  const parts = parseWallClockTime(appointmentTime);
  if (!parts) return false;
  return WORKING_HOUR_RANGES.some((range) => parts.hour >= range.startHour && parts.hour < range.endHour);
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
