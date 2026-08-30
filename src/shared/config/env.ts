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
  TEMPORAL_TLS_CLIENT_CERT_PATH: optionalString,
  TEMPORAL_TLS_CLIENT_KEY_PATH: optionalString,
  TEMPORAL_TLS_CA_PATH: optionalString,
  TEMPORAL_TLS_SERVER_NAME: optionalString,
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_ISSUER: z.string().min(1).default('temporal-healthcare-appointments'),
  JWT_AUDIENCE: z.string().min(1).default('temporal-healthcare-users'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  // IANA zone the clinic's recurring doctor schedules are defined in (wall
  // clock, e.g. "Monday 8am"). Single clinic-wide zone for now — see
  // ClinicClosure's comment on adding a clinicId later if that ever changes.
  CLINIC_TIMEZONE: z.string().min(1).default('Asia/Colombo'),
  // The three-tier confirmation/reminder policy (spec: 24h reminder, 6h
  // deadline, 2h upcoming reminder). Kept as separate hour offsets rather
  // than a single lead time, since each fires a different lifecycle event.
  CONFIRMATION_REMINDER_HOURS_BEFORE: z.coerce.number().int().min(0).default(24),
  CONFIRMATION_DEADLINE_HOURS_BEFORE: z.coerce.number().int().min(0).default(6),
  UPCOMING_REMINDER_HOURS_BEFORE: z.coerce.number().int().min(0).default(2),
  // Only RELEASE_SLOT is implemented; kept as an explicit, validated config
  // value (rather than a hardcoded literal) so the policy is documented and
  // future alternatives fail closed instead of being silently ignored.
  NO_RESPONSE_POLICY: z.enum(['RELEASE_SLOT']).default('RELEASE_SLOT'),
  REMINDER_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  RESEND_API_KEY: optionalString,
  RESEND_FROM_EMAIL: z.string().min(3).default('Healthcare Appointments <onboarding@resend.dev>'),
  REMINDER_EMAIL_TO: optionalEmail,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  OTEL_ENABLED: booleanEnvVar(false),
  OTEL_SERVICE_NAME: z.string().min(1).default('temporal-healthcare-appointments'),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalString,
  METRICS_ENABLED: booleanEnvVar(true),
  METRICS_HOST: z.string().min(1).default('0.0.0.0'),
  METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9464),
  TEMPORAL_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9465),
  DEMO_FAILURE_MODE: z.enum(['none', 'notification-once', 'create-permanent']).default('none'),
  // Backs express-rate-limit so limits are shared and correct across replicas
  // instead of being tracked per-process.
  REDIS_URL: z.string().min(1).default('redis://redis:6379'),
  // Number of reverse proxies between the public client and Express. Zero is
  // the safe default: X-Forwarded-For is ignored unless the deployment opts in.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  RATE_LIMIT_LOGIN_IP_MAX: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_LOGIN_ACCOUNT_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_LOGIN_ACCOUNT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),
  RATE_LIMIT_BOOKING_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_BOOKING_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_CONFIRM_MAX: z.coerce.number().int().min(1).default(20),
  RATE_LIMIT_CONFIRM_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_CANCEL_MAX: z.coerce.number().int().min(1).default(20),
  RATE_LIMIT_CANCEL_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_MANAGEMENT_MAX: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_MANAGEMENT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  // How often the reconciliation Workflow scans for orphaned/stuck state.
  RECONCILIATION_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
  // How long past an appointment's own end time a still-present slot
  // reservation is treated as orphaned (crashed worker, terminated workflow)
  // rather than mid-cleanup.
  ORPHANED_RESERVATION_GRACE_MINUTES: z.coerce.number().int().min(0).default(60),
  // Caps rows returned per reconciliation query per sweep, so one pass can't
  // balloon its Workflow history; a busier backlog is handled over several
  // scheduled sweeps instead of one huge one.
  RECONCILIATION_BATCH_SIZE: z.coerce.number().int().min(1).default(100)
}).refine(
  (env) => env.CONFIRMATION_DEADLINE_HOURS_BEFORE < env.CONFIRMATION_REMINDER_HOURS_BEFORE,
  { message: 'CONFIRMATION_DEADLINE_HOURS_BEFORE must be less than CONFIRMATION_REMINDER_HOURS_BEFORE', path: ['CONFIRMATION_DEADLINE_HOURS_BEFORE'] }
).refine(
  (env) => env.UPCOMING_REMINDER_HOURS_BEFORE < env.CONFIRMATION_DEADLINE_HOURS_BEFORE,
  { message: 'UPCOMING_REMINDER_HOURS_BEFORE must be less than CONFIRMATION_DEADLINE_HOURS_BEFORE', path: ['UPCOMING_REMINDER_HOURS_BEFORE'] }
);

export type Env = z.infer<typeof envSchema>;
let cached: Env | undefined;

// The well-known local-only default from docker-compose.yml. If this literal
// value shows up with NODE_ENV=production, JWT_SECRET was never actually set
// for the deployment — fail fast instead of silently signing tokens with a
// secret anyone can read in this repo's history.
const DEMO_JWT_SECRET = 'local-demo-secret-change-before-production-123456';

export function validateEnv(input: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.parse(input);
  if (parsed.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (parsed.JWT_SECRET === DEMO_JWT_SECRET || parsed.JWT_SECRET.length < 48) problems.push('JWT_SECRET must be a unique secret of at least 48 characters');
    const expiry = /^(\d+)(s|m|h)$/.exec(parsed.JWT_EXPIRES_IN);
    const multiplier = expiry?.[2] === 'h' ? 3600 : expiry?.[2] === 'm' ? 60 : 1;
    if (!expiry || Number(expiry[1]) * multiplier > 3600) problems.push('JWT_EXPIRES_IN must be a controlled duration no longer than one hour');
    if (!parsed.DATABASE_URL.includes('sslmode=verify-full')) problems.push('DATABASE_URL must enforce sslmode=verify-full');
    if (!parsed.REDIS_URL.startsWith('rediss://')) problems.push('REDIS_URL must use rediss://');
    if (!parsed.TEMPORAL_API_KEY && !parsed.TEMPORAL_TLS && !parsed.TEMPORAL_TLS_CLIENT_CERT_PATH) problems.push('Temporal TLS or API-key authentication must be enabled');
    if (parsed.OTEL_ENABLED && !parsed.OTEL_EXPORTER_OTLP_ENDPOINT) problems.push('OTEL_EXPORTER_OTLP_ENDPOINT is required when tracing is enabled');
    if (!parsed.RESEND_API_KEY) problems.push('RESEND_API_KEY is required');
    if (parsed.REMINDER_EMAIL_TO) problems.push('REMINDER_EMAIL_TO is a local testing override and must be unset');
    if (problems.length) throw new Error(`Unsafe production configuration: ${problems.join('; ')}`);
  }
  const certAndKey = Boolean(parsed.TEMPORAL_TLS_CLIENT_CERT_PATH) === Boolean(parsed.TEMPORAL_TLS_CLIENT_KEY_PATH);
  if (!certAndKey) throw new Error('TEMPORAL_TLS_CLIENT_CERT_PATH and TEMPORAL_TLS_CLIENT_KEY_PATH must be set together');
  return parsed;
}

export function getEnv(): Env {
  if (!cached) {
    cached = validateEnv(process.env);
  }
  return cached;
}
