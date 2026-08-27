import type { WorkflowStatus } from '../../types/api';

export interface BackoffOptions {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  maxAttempts: number;
}

export const defaultBackoff: BackoffOptions = {
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  factor: 1.6,
  maxAttempts: 10
};

/** Exponential backoff, capped at maxDelayMs. Exported standalone for unit testing. */
export function delayForAttempt(
  attempt: number,
  options: BackoffOptions = defaultBackoff
): number {
  const raw = options.initialDelayMs * options.factor ** attempt;
  return Math.min(Math.round(raw), options.maxDelayMs);
}

export const TERMINAL_WORKFLOW_STATUSES: WorkflowStatus[] = [
  'CONFIRMED',
  'CANCELLED',
  'FAILED'
];

export function isTerminalWorkflowStatus(status: WorkflowStatus): boolean {
  return TERMINAL_WORKFLOW_STATUSES.includes(status);
}
