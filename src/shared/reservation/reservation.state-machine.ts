import type { ReservationStatus } from './reservation.types';

/**
 * RELEASED -> RELEASED is a deliberate self-loop: slot release must be safe
 * to call more than once (a repeated Temporal Activity retry must not fail).
 */
export const RESERVATION_TRANSITIONS: Readonly<Record<ReservationStatus, readonly ReservationStatus[]>> = {
  RESERVING: ['RESERVED', 'CONFLICTED'],
  RESERVED: ['RELEASED'],
  RELEASED: ['RELEASED'],
  CONFLICTED: []
};

export class InvalidReservationTransitionError extends Error {
  constructor(public readonly from: ReservationStatus, public readonly to: ReservationStatus) {
    super(`Cannot transition reservation from ${from} to ${to}.`);
    this.name = 'InvalidReservationTransitionError';
  }
}

export function isValidReservationTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return RESERVATION_TRANSITIONS[from].includes(to);
}

export function assertValidReservationTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!isValidReservationTransition(from, to)) throw new InvalidReservationTransitionError(from, to);
}
