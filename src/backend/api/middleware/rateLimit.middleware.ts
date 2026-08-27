import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { redisClient } from '../../redis/client';

interface RateLimiterOptions {
  windowMs: number;
  limit: number;
}

/**
 * Backed by Redis (not the express-rate-limit in-memory default) so limits
 * are correct and shared once the backend runs as more than one replica.
 * `redisClient()` is only called per-request, so this can be constructed at
 * module load time, before `connectRedis()` has run at startup.
 */
export function createRateLimiter({ windowMs, limit }: RateLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new RedisStore({
      prefix: 'rl:',
      sendCommand: (...args: string[]) => redisClient().call(args[0], ...args.slice(1)) as Promise<RedisReply>
    })
  });
}
