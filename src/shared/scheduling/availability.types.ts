export type DoctorScheduleExceptionType = 'UNAVAILABLE' | 'CUSTOM_HOURS';

/** Clinic-local wall-clock window, e.g. {startTime: "08:00", endTime: "12:00"}. */
export interface RecurringWindow {
  startTime: string;
  endTime: string;
}

export interface ScheduleException {
  type: DoctorScheduleExceptionType;
  /** Required for CUSTOM_HOURS; an optional partial-day bound for UNAVAILABLE (null on both means the whole day). */
  startTime: string | null;
  endTime: string | null;
}

/** A UTC instant interval that already occupies time — an existing appointment/reservation, or a partial-day exception. */
export interface BlockingInterval {
  startAt: string;
  endAt: string;
}

export interface TimeSlot {
  startAt: string;
  endAt: string;
}

export type SlotStatus = 'AVAILABLE' | 'RESERVED' | 'PAST';

/** A candidate slot for the full-day view — present even when not bookable, tagged with why. */
export interface DaySlot extends TimeSlot {
  status: SlotStatus;
}

export interface AvailabilityInput {
  /** Clinic-local calendar date, "YYYY-MM-DD". */
  date: string;
  /** IANA zone the recurring windows/exceptions are expressed in. */
  timeZone: string;
  durationMinutes: number;
  /** This doctor's active recurring windows for `date`'s weekday only. */
  recurringWindows: RecurringWindow[];
  /** This doctor's exception for `date`, if any — at most one by schema constraint. */
  exception: ScheduleException | null;
  clinicClosed: boolean;
  /** Existing appointments/reservations (or anything else already occupying time) for this doctor overlapping `date`. */
  blockingIntervals: BlockingInterval[];
}
