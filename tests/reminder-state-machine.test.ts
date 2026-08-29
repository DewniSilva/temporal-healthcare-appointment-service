import { describe, expect, it } from 'vitest';
import {
  InvalidReminderTransitionError,
  assertValidReminderTransition,
  isValidReminderTransition
} from '../src/shared/reminder/reminder.state-machine';

describe('reminder state machine', () => {
  it('follows the full send lifecycle', () => {
    expect(isValidReminderTransition('SCHEDULED', 'PENDING')).toBe(true);
    expect(isValidReminderTransition('PENDING', 'SENDING')).toBe(true);
    expect(isValidReminderTransition('SENDING', 'SENT')).toBe(true);
    expect(isValidReminderTransition('SENT', 'DELIVERED')).toBe(true);
    expect(isValidReminderTransition('SENT', 'BOUNCED')).toBe(true);
  });

  it('allows cancellation only while not yet sent', () => {
    expect(isValidReminderTransition('SCHEDULED', 'CANCELLED')).toBe(true);
    expect(isValidReminderTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(isValidReminderTransition('SENDING', 'CANCELLED')).toBe(false);
    expect(isValidReminderTransition('SENT', 'CANCELLED')).toBe(false);
  });

  it('allows a failed send and a subsequent reconciliation retry', () => {
    expect(isValidReminderTransition('SENDING', 'FAILED')).toBe(true);
    expect(isValidReminderTransition('FAILED', 'PENDING')).toBe(true);
  });

  it('rejects sending an already-terminal reminder again', () => {
    for (const terminal of ['DELIVERED', 'BOUNCED', 'CANCELLED'] as const) {
      expect(isValidReminderTransition(terminal, 'SENDING')).toBe(false);
      expect(() => assertValidReminderTransition(terminal, 'SENDING')).toThrow(InvalidReminderTransitionError);
    }
  });
});
