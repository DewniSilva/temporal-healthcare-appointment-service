import type { ReminderType } from './reminder.types';

export interface ReminderScheduleConfig {
  confirmationReminderHoursBefore: number;
  confirmationDeadlineHoursBefore: number;
  upcomingReminderHoursBefore: number;
}

export interface ReminderSchedule {
  confirmationReminderAt: string;
  confirmationDeadlineAt: string;
  upcomingReminderAt: string;
}

function minus(appointmentTimeMs: number, hours: number): string {
  return new Date(appointmentTimeMs - hours * 60 * 60_000).toISOString();
}

/**
 * Pure timeline math for the confirmation/reminder policy (spec: 24h
 * reminder, 6h deadline, 2h upcoming reminder — all configurable). No I/O,
 * safe to call from deterministic Workflow code.
 */
export function computeReminderSchedule(appointmentTime: string, config: ReminderScheduleConfig): ReminderSchedule {
  const appointmentTimeMs = new Date(appointmentTime).getTime();
  return {
    confirmationReminderAt: minus(appointmentTimeMs, config.confirmationReminderHoursBefore),
    confirmationDeadlineAt: minus(appointmentTimeMs, config.confirmationDeadlineHoursBefore),
    upcomingReminderAt: minus(appointmentTimeMs, config.upcomingReminderHoursBefore)
  };
}

/**
 * Spec §9: a booking made after its own confirmation deadline has already
 * passed (e.g. booked same-day, close to the appointment) has no normal
 * confirmation window left. Policy: treat it as immediately confirmed rather
 * than racing it straight to NO_RESPONSE.
 */
export function isLateBooking(now: number, confirmationDeadlineAt: string): boolean {
  return now >= new Date(confirmationDeadlineAt).getTime();
}

/**
 * Extension of the late-booking policy: a booking made even later — after
 * its own 2-hour upcoming-reminder mark — has no meaningful upcoming-reminder
 * window left either. Rather than firing that reminder immediately (it would
 * arrive at booking time, not "2 hours before"), it is skipped/cancelled.
 */
export function isUpcomingReminderElapsed(now: number, upcomingReminderAt: string): boolean {
  return now >= new Date(upcomingReminderAt).getTime();
}

/**
 * Spec §22: a FAILED reminder is only worth retrying while it's still
 * eligible for its own status — a CONFIRMATION_REMINDER only while the
 * appointment is still BOOKED and before its own deadline, an
 * UPCOMING_REMINDER only while the appointment is still CONFIRMED and
 * hasn't happened yet. Used by reconciliation to decide what to retry
 * without duplicating this cutoff logic in a Prisma query.
 */
export function isReminderRetryEligible(
  type: ReminderType,
  appointmentStatus: string,
  appointmentTime: string,
  now: number,
  config: ReminderScheduleConfig
): boolean {
  if (type === 'CONFIRMATION_REMINDER') {
    if (appointmentStatus !== 'BOOKED') return false;
    const schedule = computeReminderSchedule(appointmentTime, config);
    return now < new Date(schedule.confirmationDeadlineAt).getTime();
  }
  if (appointmentStatus !== 'CONFIRMED') return false;
  return now < new Date(appointmentTime).getTime();
}

/**
 * Spec §19: re-checked immediately before every send, not just when the
 * reminder was scheduled — protects against a patient cancelling (or
 * confirming) in the window between the Activity starting and the Resend
 * call actually going out.
 */
export function canSendReminder(type: ReminderType, appointmentStatus: string, appointmentTimeMs: number, now: number): boolean {
  const stillUpcoming = appointmentTimeMs > now;
  if (type === 'CONFIRMATION_REMINDER') return appointmentStatus === 'BOOKED' && stillUpcoming;
  return appointmentStatus === 'CONFIRMED' && stillUpcoming;
}
