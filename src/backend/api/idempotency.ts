import { createHash } from 'node:crypto';

/**
 * Scopes an API idempotency key to the authenticated user. The same caller and
 * key always produce the same non-sensitive appointment and Workflow IDs.
 */
export function appointmentIdForIdempotencyKey(userId: string, idempotencyKey: string): string {
  return `apt-${createHash('sha256').update(`${userId}:${idempotencyKey}`).digest('hex').slice(0, 24)}`;
}
