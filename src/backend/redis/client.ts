import Redis from 'ioredis';
import { getEnv } from '../../shared/config/env';

let client: Redis | undefined;

export async function connectRedis(maxAttempts = 10): Promise<Redis> {
  if (client) return client;
  const env = getEnv();
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const candidate = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
      await candidate.connect();
      client = candidate;
      return client;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 1_000, 5_000)));
    }
  }
  throw lastError;
}

export function redisClient(): Redis {
  if (!client) throw new Error('Redis client has not been initialized');
  return client;
}

export async function closeRedis(): Promise<void> {
  await client?.quit();
  client = undefined;
}
