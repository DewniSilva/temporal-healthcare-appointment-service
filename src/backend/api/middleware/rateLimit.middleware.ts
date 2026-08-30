import { createHash } from 'node:crypto';
import rateLimit, {
  ipKeyGenerator,
  type RateLimitRequestHandler,
  type Store,
  type ValueDeterminingMiddleware
} from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { Request } from 'express';
import { redisClient } from '../../redis/client';
import { getEnv } from '../../../shared/config/env';
import { logger } from '../../../shared/logging/logger';
import { recordRateLimitBlocked, recordRateLimitRedisError, recordRateLimitRequest } from '../../../shared/observability/metrics';

export type RateLimitPolicyName =
  | 'login-ip'
  | 'login-account'
  | 'booking'
  | 'confirm'
  | 'cancel'
  | 'management';

interface RateLimiterOptions {
  name: RateLimitPolicyName;
  windowMs: number;
  limit: number;
  keyGenerator: ValueDeterminingMiddleware<string>;
  /** Test seam; production always creates a rate-limit-redis store. */
  store?: Store;
}

interface RateLimitPolicy { limit: number; windowMs: number; }

export interface RateLimitPolicies {
  loginIp: RateLimitPolicy;
  loginAccount: RateLimitPolicy;
  booking: RateLimitPolicy;
  confirm: RateLimitPolicy;
  cancel: RateLimitPolicy;
  management: RateLimitPolicy;
}

export function rateLimitPolicies(): RateLimitPolicies {
  const env = getEnv();
  return {
    loginIp: { limit: env.RATE_LIMIT_LOGIN_IP_MAX, windowMs: env.RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS * 1_000 },
    loginAccount: { limit: env.RATE_LIMIT_LOGIN_ACCOUNT_MAX, windowMs: env.RATE_LIMIT_LOGIN_ACCOUNT_WINDOW_SECONDS * 1_000 },
    booking: { limit: env.RATE_LIMIT_BOOKING_MAX, windowMs: env.RATE_LIMIT_BOOKING_WINDOW_SECONDS * 1_000 },
    confirm: { limit: env.RATE_LIMIT_CONFIRM_MAX, windowMs: env.RATE_LIMIT_CONFIRM_WINDOW_SECONDS * 1_000 },
    cancel: { limit: env.RATE_LIMIT_CANCEL_MAX, windowMs: env.RATE_LIMIT_CANCEL_WINDOW_SECONDS * 1_000 },
    management: { limit: env.RATE_LIMIT_MANAGEMENT_MAX, windowMs: env.RATE_LIMIT_MANAGEMENT_WINDOW_SECONDS * 1_000 }
  };
}

export function clientIpKey(req: Request): string {
  return `ip:${ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown')}`;
}

export function loginAccountKey(req: Request): string {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  // Hash normalized emails so account identifiers are not visible in Redis
  // keys or operational tooling.
  if (!email) return `invalid-account:${ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown')}`;
  return `account:${createHash('sha256').update(email).digest('hex')}`;
}

export function authenticatedUserKey(req: Request): string {
  return req.auth ? `user:${req.auth.userId}` : clientIpKey(req);
}

/**
 * rate-limit-redis performs the fixed-window increment atomically in Redis
 * using Lua. Every backend replica uses the same Redis URL and key namespace.
 */
export function createRateLimiter({ name, windowMs, limit, keyGenerator, store }: RateLimiterOptions): RateLimitRequestHandler {
  const selectedStore = store ?? new RedisStore({
    prefix: `rate-limit:${name}:`,
    sendCommand: (...args: string[]) => redisClient().call(args[0], ...args.slice(1)) as Promise<RedisReply>
  });

  return rateLimit({
    windowMs,
    limit,
    keyGenerator: async (req, res) => {
      recordRateLimitRequest(name);
      return keyGenerator(req, res);
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: selectedStore,
    // Redis controls abuse, not booking correctness. Fail open during a
    // transient store outage; readiness still reports Redis unavailable.
    passOnStoreError: true,
    logger: {
      error: (error, message) => {
        recordRateLimitRedisError(name);
        logger.warn({ event: 'rate_limit_store_error', policy: name, error, message });
      },
      warn: (warning, message) => logger.warn({ event: 'rate_limit_warning', policy: name, warning, message })
    },
    handler: (req, res) => {
      recordRateLimitBlocked(name);
      const retryAfter = res.getHeader('retry-after');
      logger.warn({
        event: 'rate_limit_exceeded',
        policy: name,
        endpoint: req.path,
        method: req.method,
        userId: req.auth?.userId,
        clientIp: req.ip,
        limit,
        windowSeconds: windowMs / 1_000,
        retryAfter,
        requestId: req.requestId
      });
      res.status(429).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' }
      });
    }
  });
}

export function createLoginRateLimiters(): RateLimitRequestHandler[] {
  const policies = rateLimitPolicies();
  return [
    createRateLimiter({ name: 'login-ip', ...policies.loginIp, keyGenerator: clientIpKey }),
    createRateLimiter({ name: 'login-account', ...policies.loginAccount, keyGenerator: loginAccountKey })
  ];
}

export function createAuthenticatedRateLimiter(
  name: Exclude<RateLimitPolicyName, 'login-ip' | 'login-account'>
): RateLimitRequestHandler {
  const policies = rateLimitPolicies();
  const policy = name === 'booking'
    ? policies.booking
    : name === 'confirm'
      ? policies.confirm
      : name === 'cancel'
        ? policies.cancel
        : policies.management;
  return createRateLimiter({ name, ...policy, keyGenerator: authenticatedUserKey });
}
