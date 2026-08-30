import { zonedWallClockToUtc } from './timezone';
import type { AvailabilityInput, DaySlot, RecurringWindow, ScheduleException, TimeSlot } from './availability.types';

interface MsInterval {
  startMs: number;
  endMs: number;
}

/**
 * Resolves which recurring windows actually apply to `input.date`, per the
 * spec precedence: clinic closed -> none; doctor UNAVAILABLE (whole day) ->
 * none; doctor CUSTOM_HOURS -> replaces the recurring windows; otherwise ->
 * the recurring weekly schedule. A partial-day UNAVAILABLE keeps the
 * recurring windows but reports the blocked sub-interval separately (via
 * `exceptionBlocking`) so callers can treat it as "this slot never existed
 * today," not as an occupied booking.
 */
function resolveEffectiveWindows(input: Omit<AvailabilityInput, 'durationMinutes'>): { windows: RecurringWindow[]; exceptionBlocking: MsInterval[] } {
  if (input.clinicClosed) return { windows: [], exceptionBlocking: [] };

  if (input.exception?.type === 'UNAVAILABLE') {
    if (input.exception.startTime && input.exception.endTime) {
      return {
        windows: input.recurringWindows,
        exceptionBlocking: [{
          startMs: zonedWallClockToUtc(input.date, input.exception.startTime, input.timeZone).getTime(),
          endMs: zonedWallClockToUtc(input.date, input.exception.endTime, input.timeZone).getTime()
        }]
      };
    }
    return { windows: [], exceptionBlocking: [] };
  }

  if (input.exception?.type === 'CUSTOM_HOURS') {
    return { windows: [{ startTime: input.exception.startTime!, endTime: input.exception.endTime! }], exceptionBlocking: [] };
  }

  return { windows: input.recurringWindows, exceptionBlocking: [] };
}

/** Generates every fixed-duration candidate that fits entirely inside `windows`, in order, with no filtering. */
function generateCandidateSlots(windows: RecurringWindow[], date: string, timeZone: string, durationMinutes: number): TimeSlot[] {
  const durationMs = durationMinutes * 60_000;
  const slots: TimeSlot[] = [];

  for (const window of windows) {
    const windowStartMs = zonedWallClockToUtc(date, window.startTime, timeZone).getTime();
    const windowEndMs = zonedWallClockToUtc(date, window.endTime, timeZone).getTime();
    // The requested duration must fit entirely inside the window — no partial trailing slot.
    for (let slotStartMs = windowStartMs; slotStartMs + durationMs <= windowEndMs; slotStartMs += durationMs) {
      slots.push({ startAt: new Date(slotStartMs).toISOString(), endAt: new Date(slotStartMs + durationMs).toISOString() });
    }
  }

  return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/**
 * The full day's schedule for display: every slot the doctor is actually
 * scheduled for on this date (after exceptions/closures are applied) is
 * present, tagged with why it can or can't be booked. A slot blocked by a
 * partial-day leave exception is not included at all — it was never really
 * "the doctor's scheduled time" that day, unlike a genuine reservation,
 * which stays visible but RESERVED.
 */
export function computeDaySlots(input: AvailabilityInput): DaySlot[] {
  const { windows, exceptionBlocking } = resolveEffectiveWindows(input);
  const candidates = generateCandidateSlots(windows, input.date, input.timeZone, input.durationMinutes)
    .filter((slot) => {
      const slotStartMs = new Date(slot.startAt).getTime();
      const slotEndMs = new Date(slot.endAt).getTime();
      return !exceptionBlocking.some((b) => slotStartMs < b.endMs && slotEndMs > b.startMs);
    });

  const reservedIntervals: MsInterval[] = input.blockingIntervals.map((interval) => ({
    startMs: new Date(interval.startAt).getTime(),
    endMs: new Date(interval.endAt).getTime()
  }));
  const nowMs = Date.now();

  return candidates.map((slot) => {
    const slotStartMs = new Date(slot.startAt).getTime();
    const slotEndMs = new Date(slot.endAt).getTime();
    let status: DaySlot['status'] = 'AVAILABLE';
    if (slotStartMs <= nowMs) status = 'PAST';
    else if (reservedIntervals.some((b) => slotStartMs < b.endMs && slotEndMs > b.startMs)) status = 'RESERVED';
    return { ...slot, status };
  });
}

/**
 * Pure availability calculation — no I/O, safe to call from anywhere
 * (backend for GET available-slots, worker Activities for authoritative
 * reservation-time re-validation). Only the slots that are actually bookable
 * right now; see computeDaySlots for the full-day display view.
 */
export function computeAvailableSlots(input: AvailabilityInput): TimeSlot[] {
  return computeDaySlots(input)
    .filter((slot) => slot.status === 'AVAILABLE')
    .map(({ startAt, endAt }) => ({ startAt, endAt }));
}

/** Authoritative point check reused at reservation time: is this exact interval one of the currently available slots? */
export function isSlotAvailable(startAt: string, input: AvailabilityInput): boolean {
  return computeAvailableSlots(input).some((slot) => slot.startAt === new Date(startAt).toISOString());
}

/**
 * Whether an existing appointment would fall outside the doctor's schedule
 * once `exception` applies to `date` — used to *detect* (never silently
 * cancel) appointments affected by a newly-added leave/custom-hours entry.
 */
export function appointmentConflictsWithException(appointmentTime: Date | string, exception: ScheduleException, date: string, timeZone: string): boolean {
  const instantMs = (appointmentTime instanceof Date ? appointmentTime : new Date(appointmentTime)).getTime();
  if (exception.type === 'UNAVAILABLE') {
    if (!exception.startTime || !exception.endTime) return true; // whole day
    const start = zonedWallClockToUtc(date, exception.startTime, timeZone).getTime();
    const end = zonedWallClockToUtc(date, exception.endTime, timeZone).getTime();
    return instantMs >= start && instantMs < end;
  }
  // CUSTOM_HOURS: conflicting if the appointment falls outside the new custom window.
  const start = zonedWallClockToUtc(date, exception.startTime!, timeZone).getTime();
  const end = zonedWallClockToUtc(date, exception.endTime!, timeZone).getTime();
  return !(instantMs >= start && instantMs < end);
}
