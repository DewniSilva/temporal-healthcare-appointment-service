import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().min(1).optional()
);

const optionalEmail = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().email().optional()
);

// z.coerce.boolean() just runs JS's Boolean(value), so the *string* "false"
// (what every env var actually is) coerces to true. Parse the literal text instead.
const booleanEnvVar = (defaultValue: boolean) =>
  z.preprocess(
    (value) => value === undefined ? defaultValue : value === 'true' || value === '1',
    z.boolean()
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  TEMPORAL_ADDRESS: z.string().default('temporal:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_TASK_QUEUE: z.string().default('healthcare-appointments'),
  // Enables TLS to Temporal (e.g. a self-hosted cluster with TLS termination).
  // Automatically implied by TEMPORAL_API_KEY, so most Temporal Cloud setups
  // only need to set that. Left false for the plaintext local Compose network.
  TEMPORAL_TLS: booleanEnvVar(false),
  // Set for Temporal Cloud (or any server using API-key auth); enables TLS.
  TEMPORAL_API_KEY: optionalString,
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  REMINDER_LEAD_TIME_SECONDS: z.coerce.number().int().min(0).default(7_200),
  RESEND_API_KEY: optionalString,
  RESEND_FROM_EMAIL: z.string().min(3).default('Healthcare Appointments <onboarding@resend.dev>'),
  REMINDER_EMAIL_TO: optionalEmail,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DEMO_FAILURE_MODE: z.enum(['none', 'notification-once', 'create-permanent']).default('none'),
  // Backs express-rate-limit so limits are shared and correct across replicas
  // instead of being tracked per-process.
  REDIS_URL: z.string().min(1).default('redis://redis:6379'),
  // How often the reconciliation Workflow scans for orphaned/stuck state.
  RECONCILIATION_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
  // How long past an appointment's own end time a still-present slot
  // reservation is treated as orphaned (crashed worker, terminated workflow)
  // rather than mid-cleanup.
  ORPHANED_RESERVATION_GRACE_MINUTES: z.coerce.number().int().min(0).default(60)
});

export type Env = z.infer<typeof envSchema>;
let cached: Env | undefined;

// The well-known local-only default from docker-compose.yml. If this literal
// value shows up with NODE_ENV=production, JWT_SECRET was never actually set
// for the deployment — fail fast instead of silently signing tokens with a
// secret anyone can read in this repo's history.
const DEMO_JWT_SECRET = 'local-demo-secret-change-before-production-123456';

export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.parse(process.env);
    if (parsed.NODE_ENV === 'production' && parsed.JWT_SECRET === DEMO_JWT_SECRET) {
      throw new Error(
        'JWT_SECRET is set to the local-development default. Set a real secret ' +
        '(from your secrets manager) before running with NODE_ENV=production.'
      );
    }
    cached = parsed;
  }
  return cached;
}
