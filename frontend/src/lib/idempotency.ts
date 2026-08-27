/** Thin wrapper so call sites and tests do not depend on the global crypto API directly. */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
