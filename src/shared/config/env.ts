import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  TEMPORAL_ADDRESS: z.string().default('temporal:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_TASK_QUEUE: z.string().default('healthcare-appointments'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  REMINDER_LEAD_TIME_SECONDS: z.coerce.number().int().min(0).default(30),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DEMO_FAILURE_MODE: z.enum(['none', 'notification-once', 'create-permanent']).default('none')
});

export type Env = z.infer<typeof envSchema>;
let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}
