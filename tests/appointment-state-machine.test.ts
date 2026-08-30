import { describe, expect, it } from 'vitest';
import {
  APPOINTMENT_TRANSITIONS,
  InvalidAppointmentTransitionError,
  assertValidAppointmentTransition,
  isValidAppointmentTransition
} from '../src/shared/appointment/appointment.state-machine';
import { isTerminalAppointmentStatus } from '../src/shared/appointment/appointment.types';
import type { AppointmentStatus } from '../src/shared/appointment/appointment.types';

const ALL_STATUSES = Object.keys(APPOINTMENT_TRANSITIONS) as AppointmentStatus[];

describe('appointment state machine', () => {
  it('allows every valid transition from the spec', () => {
    const valid: Array<[AppointmentStatus, AppointmentStatus]> = [
      ['REQUESTED', 'RESERVING'],
      ['REQUESTED', 'REJECTED'],
      ['RESERVING', 'BOOKED'],
      ['RESERVING', 'BOOKING_FAILED'],
      ['BOOKED', 'CONFIRMED'],
      ['BOOKED', 'CANCELLED'],
      ['BOOKED', 'NO_RESPONSE'],
      ['CONFIRMED', 'CANCELLED'],
      ['CONFIRMED', 'COMPLETED'],
      ['CONFIRMED', 'NO_SHOW']
    ];
    for (const [from, to] of valid) {
      expect(isValidAppointmentTransition(from, to)).toBe(true);
      expect(() => assertValidAppointmentTransition(from, to)).not.toThrow();
    }
  });

  it('rejects every named invalid transition', () => {
    const invalid: Array<[AppointmentStatus, AppointmentStatus]> = [
      ['CANCELLED', 'CONFIRMED'],
      ['COMPLETED', 'CANCELLED'],
      ['NO_SHOW', 'CONFIRMED'],
      ['REJECTED', 'BOOKED'],
      ['BOOKING_FAILED', 'BOOKED'],
      ['NO_RESPONSE', 'CONFIRMED']
    ];
    for (const [from, to] of invalid) {
      expect(isValidAppointmentTransition(from, to)).toBe(false);
      expect(() => assertValidAppointmentTransition(from, to)).toThrow(InvalidAppointmentTransitionError);
    }
  });

  it('rejects skipping straight to a terminal state from REQUESTED', () => {
    expect(isValidAppointmentTransition('REQUESTED', 'BOOKED')).toBe(false);
    expect(isValidAppointmentTransition('REQUESTED', 'CONFIRMED')).toBe(false);
  });

  it('has no outgoing transitions from any terminal state', () => {
    for (const status of ALL_STATUSES) {
      if (isTerminalAppointmentStatus(status)) {
        expect(APPOINTMENT_TRANSITIONS[status]).toEqual([]);
      }
    }
  });

  it('classifies exactly the six terminal statuses', () => {
    const terminal = ALL_STATUSES.filter(isTerminalAppointmentStatus).sort();
    expect(terminal).toEqual(['BOOKING_FAILED', 'CANCELLED', 'COMPLETED', 'NO_RESPONSE', 'NO_SHOW', 'REJECTED'].sort());
  });
});
