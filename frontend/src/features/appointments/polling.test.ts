import { describe, expect, it } from 'vitest';
import { delayForAttempt, isTerminalWorkflowStatus } from './polling';

describe('delayForAttempt', () => {
  const options = { initialDelayMs: 1000, maxDelayMs: 8000, factor: 2, maxAttempts: 10 };

  it('grows exponentially with the attempt number', () => {
    expect(delayForAttempt(0, options)).toBe(1000);
    expect(delayForAttempt(1, options)).toBe(2000);
    expect(delayForAttempt(2, options)).toBe(4000);
  });

  it('caps the delay at maxDelayMs', () => {
    expect(delayForAttempt(10, options)).toBe(8000);
    expect(delayForAttempt(20, options)).toBe(8000);
  });
});

describe('isTerminalWorkflowStatus', () => {
  it('treats CONFIRMED and every other resting-or-terminal status as terminal for polling purposes', () => {
    expect(isTerminalWorkflowStatus('CONFIRMED')).toBe(true);
    expect(isTerminalWorkflowStatus('CANCELLED')).toBe(true);
    expect(isTerminalWorkflowStatus('NO_RESPONSE')).toBe(true);
    expect(isTerminalWorkflowStatus('COMPLETED')).toBe(true);
    expect(isTerminalWorkflowStatus('NO_SHOW')).toBe(true);
    expect(isTerminalWorkflowStatus('REJECTED')).toBe(true);
    expect(isTerminalWorkflowStatus('BOOKING_FAILED')).toBe(true);
  });

  it('treats REQUESTED, RESERVING, and BOOKED as non-terminal', () => {
    expect(isTerminalWorkflowStatus('REQUESTED')).toBe(false);
    expect(isTerminalWorkflowStatus('RESERVING')).toBe(false);
    expect(isTerminalWorkflowStatus('BOOKED')).toBe(false);
  });
});
