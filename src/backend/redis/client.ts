import Redis from 'ioredis';
import { getEnv } from '../../shared/config/env';
import { logger } from '../../shared/logging/logger';

let client: Redis | undefined;

export async function connectRedis(maxAttempts = 10): Promise<Redis> {
  if (client) return client;
  const env = getEnv();
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let candidate: Redis | undefined;
    try {
      candidate = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => Math.min(times * 200, 5_000)
      });
      candidate.on('error', (error) => logger.warn({ event: 'redis_connection_error', error }));
      await candidate.connect();
      client = candidate;
      logger.info({ event: 'redis_connected' });
      return client;
    } catch (error) {
      lastError = error;
      candidate?.disconnect();
      logger.warn({ event: 'redis_connection_retry', attempt, error });
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
  if (client?.status === 'ready') await client.quit();
  else client?.disconnect();
  client = undefined;
}
