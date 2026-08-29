import { describe, expect, it } from 'vitest';
import { computeReminderSchedule, isLateBooking, isReminderRetryEligible, isUpcomingReminderElapsed } from '../src/shared/reminder/reminder.policy';

const config = { confirmationReminderHoursBefore: 24, confirmationDeadlineHoursBefore: 6, upcomingReminderHoursBefore: 2 };

describe('reminder policy', () => {
  it('computes the exact Monday 3pm worked example from the spec', () => {
    const schedule = computeReminderSchedule('2026-08-31T15:00:00Z', config);
    expect(schedule.confirmationReminderAt).toBe('2026-08-30T15:00:00.000Z'); // Sunday 3pm
    expect(schedule.confirmationDeadlineAt).toBe('2026-08-31T09:00:00.000Z'); // Monday 9am
    expect(schedule.upcomingReminderAt).toBe('2026-08-31T13:00:00.000Z'); // Monday 1pm
  });

  it('detects a late booking once the confirmation deadline has already passed', () => {
    const schedule = computeReminderSchedule('2026-08-31T15:00:00Z', config);
    // Booking made Monday 10am: deadline (9am) already passed.
    expect(isLateBooking(new Date('2026-08-31T10:00:00Z').getTime(), schedule.confirmationDeadlineAt)).toBe(true);
    // Booking made Sunday noon: deadline is still ahead.
    expect(isLateBooking(new Date('2026-08-31T05:00:00Z').getTime(), schedule.confirmationDeadlineAt)).toBe(false);
  });

  it('detects an already-elapsed upcoming-reminder window for a very late booking', () => {
    const schedule = computeReminderSchedule('2026-08-31T15:00:00Z', config);
    // Booking made Monday 2pm: the 1pm upcoming-reminder mark has already passed.
    expect(isUpcomingReminderElapsed(new Date('2026-08-31T14:00:00Z').getTime(), schedule.upcomingReminderAt)).toBe(true);
    // Booking made Monday noon: the 1pm mark is still ahead.
    expect(isUpcomingReminderElapsed(new Date('2026-08-31T12:00:00Z').getTime(), schedule.upcomingReminderAt)).toBe(false);
  });

  it('retries a failed confirmation reminder only while BOOKED and before its own deadline (test 26)', () => {
    const appointmentTime = '2026-08-31T15:00:00Z'; // deadline: 2026-08-31T09:00:00Z
    const beforeDeadline = new Date('2026-08-31T08:00:00Z').getTime();
    const afterDeadline = new Date('2026-08-31T10:00:00Z').getTime();
    expect(isReminderRetryEligible('CONFIRMATION_REMINDER', 'BOOKED', appointmentTime, beforeDeadline, config)).toBe(true);
    expect(isReminderRetryEligible('CONFIRMATION_REMINDER', 'BOOKED', appointmentTime, afterDeadline, config)).toBe(false);
    expect(isReminderRetryEligible('CONFIRMATION_REMINDER', 'CONFIRMED', appointmentTime, beforeDeadline, config)).toBe(false);
    expect(isReminderRetryEligible('CONFIRMATION_REMINDER', 'NO_RESPONSE', appointmentTime, beforeDeadline, config)).toBe(false);
  });

  it('retries a failed upcoming reminder only while CONFIRMED and before the appointment time (test 27)', () => {
    const appointmentTime = '2026-08-31T15:00:00Z';
    const beforeAppointment = new Date('2026-08-31T14:00:00Z').getTime();
    const afterAppointment = new Date('2026-08-31T16:00:00Z').getTime();
    expect(isReminderRetryEligible('UPCOMING_REMINDER', 'CONFIRMED', appointmentTime, beforeAppointment, config)).toBe(true);
    expect(isReminderRetryEligible('UPCOMING_REMINDER', 'CONFIRMED', appointmentTime, afterAppointment, config)).toBe(false);
    expect(isReminderRetryEligible('UPCOMING_REMINDER', 'BOOKED', appointmentTime, beforeAppointment, config)).toBe(false);
  });
});
