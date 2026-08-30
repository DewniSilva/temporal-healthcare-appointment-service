import type { AppointmentStatus } from './appointment.types';

/**
 * The single source of truth for which appointment transitions are legal.
 * Every place that changes Appointment.status (Temporal Activities today,
 * nothing else) must go through assertValidAppointmentTransition rather than
 * re-deriving these rules — see appointment.repository.ts.
 */
export const APPOINTMENT_TRANSITIONS: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  REQUESTED: ['RESERVING', 'REJECTED'],
  RESERVING: ['BOOKED', 'BOOKING_FAILED'],
  BOOKED: ['CONFIRMED', 'CANCELLED', 'NO_RESPONSE'],
  CONFIRMED: ['CANCELLED', 'COMPLETED', 'NO_SHOW'],
  NO_RESPONSE: [],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
  REJECTED: [],
  BOOKING_FAILED: []
};

export class InvalidAppointmentTransitionError extends Error {
  constructor(public readonly from: AppointmentStatus, public readonly to: AppointmentStatus) {
    super(`Cannot transition appointment from ${from} to ${to}.`);
    this.name = 'InvalidAppointmentTransitionError';
  }
}

export function isValidAppointmentTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[from].includes(to);
}

export function assertValidAppointmentTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!isValidAppointmentTransition(from, to)) throw new InvalidAppointmentTransitionError(from, to);
}
