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
  it('treats CONFIRMED, CANCELLED, and FAILED as terminal', () => {
    expect(isTerminalWorkflowStatus('CONFIRMED')).toBe(true);
    expect(isTerminalWorkflowStatus('CANCELLED')).toBe(true);
    expect(isTerminalWorkflowStatus('FAILED')).toBe(true);
  });

  it('treats BOOKING, SCHEDULED, and WAITING_FOR_CONFIRMATION as non-terminal', () => {
    expect(isTerminalWorkflowStatus('BOOKING')).toBe(false);
    expect(isTerminalWorkflowStatus('SCHEDULED')).toBe(false);
    expect(isTerminalWorkflowStatus('WAITING_FOR_CONFIRMATION')).toBe(false);
  });
});
