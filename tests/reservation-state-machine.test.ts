import { describe, expect, it } from 'vitest';
import {
  InvalidReservationTransitionError,
  assertValidReservationTransition,
  isValidReservationTransition
} from '../src/shared/reservation/reservation.state-machine';

describe('reservation state machine', () => {
  it('allows RESERVING to resolve to RESERVED or CONFLICTED', () => {
    expect(isValidReservationTransition('RESERVING', 'RESERVED')).toBe(true);
    expect(isValidReservationTransition('RESERVING', 'CONFLICTED')).toBe(true);
  });

  it('allows RESERVED to release', () => {
    expect(isValidReservationTransition('RESERVED', 'RELEASED')).toBe(true);
  });

  it('makes release idempotent: RELEASED -> RELEASED is a valid no-op', () => {
    expect(isValidReservationTransition('RELEASED', 'RELEASED')).toBe(true);
    expect(() => assertValidReservationTransition('RELEASED', 'RELEASED')).not.toThrow();
  });

  it('rejects reviving a released or conflicted reservation', () => {
    expect(isValidReservationTransition('RELEASED', 'RESERVED')).toBe(false);
    expect(isValidReservationTransition('CONFLICTED', 'RESERVED')).toBe(false);
    expect(() => assertValidReservationTransition('CONFLICTED', 'RESERVED')).toThrow(InvalidReservationTransitionError);
  });

  it('rejects releasing a reservation that never became RESERVED', () => {
    expect(isValidReservationTransition('RESERVING', 'RELEASED')).toBe(false);
  });
});
