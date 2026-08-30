import { describe, expect, it } from 'vitest';
import { validateEnv } from '../src/shared/config/env';

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:secret@db.example/healthcare?sslmode=verify-full',
  REDIS_URL: 'rediss://:secret@redis.example:6380',
  TEMPORAL_ADDRESS: 'cluster.tmprl.cloud:7233',
  TEMPORAL_API_KEY: 'not-a-real-key',
  JWT_SECRET: 'a-unique-production-secret-that-is-longer-than-forty-eight-characters',
  RESEND_API_KEY: 'not-a-real-resend-key',
  OTEL_ENABLED: 'true',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example/v1/traces'
} satisfies NodeJS.ProcessEnv;

describe('production configuration', () => {
  it('accepts encrypted authenticated dependencies', () => {
    expect(validateEnv(base).NODE_ENV).toBe('production');
  });

  it.each([
    ['DATABASE_URL', 'postgresql://app:secret@db/healthcare'],
    ['REDIS_URL', 'redis://redis:6379'],
    ['JWT_SECRET', 'short-but-at-least-thirty-two-characters'],
    ['JWT_EXPIRES_IN', '7d'],
    ['RESEND_API_KEY', '']
  ])('rejects unsafe %s', (key, value) => {
    expect(() => validateEnv({ ...base, [key]: value })).toThrow(/Unsafe production configuration/);
  });

  it('never includes a supplied secret value in validation errors', () => {
    const secretValue = 'do-not-print-this-database-password';
    let message = '';
    try {
      validateEnv({ ...base, DATABASE_URL: `postgresql://app:${secretValue}@db/healthcare` });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(secretValue);
  });
});
