import { z } from 'zod';

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default('/api'),
  VITE_TEMPORAL_UI_URL: z.string().url().optional()
});

function readEnv() {
  const parsed = envSchema.safeParse(import.meta.env);
  if (!parsed.success) {
    // Fail fast and loud: a misconfigured deployment should not silently
    // fall back to a wrong API base URL.
    throw new Error(`Invalid frontend environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const env = readEnv();
