import type { Server } from 'node:http';
import express, { type Request } from 'express';
import type { IncrementResponse, Options, Store } from 'express-rate-limit';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RateLimitPolicyName } from '../src/backend/api/middleware/rateLimit.middleware';

let rateLimitModule: typeof import('../src/backend/api/middleware/rateLimit.middleware');

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET ??= 'test-secret-at-least-thirty-two-characters';
  process.env.RATE_LIMIT_LOGIN_IP_MAX = '5';
  process.env.RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS = '60';
  process.env.RATE_LIMIT_LOGIN_ACCOUNT_MAX = '10';
  process.env.RATE_LIMIT_LOGIN_ACCOUNT_WINDOW_SECONDS = '900';
  process.env.RATE_LIMIT_BOOKING_MAX = '10';
  process.env.RATE_LIMIT_BOOKING_WINDOW_SECONDS = '60';
  rateLimitModule = await import('../src/backend/api/middleware/rateLimit.middleware');
});

interface Counter { totalHits: number; resetTime: Date; }

class SharedFixedWindowStore implements Store {
  readonly localKeys = false;
  private windowMs = 60_000;

  constructor(private readonly counters: Map<string, Counter>, readonly prefix: string) {}

  init(options: Options): void { this.windowMs = options.windowMs; }

  increment(key: string): IncrementResponse {
    const fullKey = `${this.prefix}${key}`;
    const now = Date.now();
    let counter = this.counters.get(fullKey);
    if (!counter || counter.resetTime.getTime() <= now) {
      counter = { totalHits: 0, resetTime: new Date(now + this.windowMs) };
      this.counters.set(fullKey, counter);
    }
    counter.totalHits += 1;
    return { totalHits: counter.totalHits, resetTime: counter.resetTime };
  }

  decrement(key: string): void {
    const counter = this.counters.get(`${this.prefix}${key}`);
    if (counter) counter.totalHits = Math.max(0, counter.totalHits - 1);
  }

  resetKey(key: string): void { this.counters.delete(`${this.prefix}${key}`); }
}

class FailingStore implements Store {
  increment(): IncrementResponse { throw new Error('redis unavailable'); }
  decrement(): void {}
  resetKey(): void {}
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

async function startTestApi(options: {
  store: Store;
  name?: RateLimitPolicyName;
  limit?: number;
  windowMs?: number;
}): Promise<string> {
  const app = express();
  app.use((req, _res, next) => {
    req.requestId = 'rate-limit-test';
    req.auth = { userId: req.header('x-test-user') ?? 'user-a', role: 'PATIENT' };
    next();
  });
  app.post('/limited', rateLimitModule.createRateLimiter({
    name: options.name ?? 'booking',
    limit: options.limit ?? 5,
    windowMs: options.windowMs ?? 1_000,
    keyGenerator: rateLimitModule.authenticatedUserKey,
    store: options.store
  }), (_req, res) => res.json({ ok: true }));

  const server = await new Promise<Server>((resolve) => {
    const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind to TCP');
  return `http://127.0.0.1:${address.port}`;
}

function post(baseUrl: string, userId = 'user-a'): Promise<Response> {
  return fetch(`${baseUrl}/limited`, { method: 'POST', headers: { 'x-test-user': userId } });
}

describe('distributed rate limiting', () => {
  it('uses distinct configurable defaults for login and booking', () => {
    const policies = rateLimitModule.rateLimitPolicies();
    expect(policies.loginIp).toEqual({ limit: 5, windowMs: 60_000 });
    expect(policies.loginAccount).toEqual({ limit: 10, windowMs: 900_000 });
    expect(policies.booking).toEqual({ limit: 10, windowMs: 60_000 });
  });

  it('shares one counter across two API instances and returns the standard 429 response', async () => {
    const counters = new Map<string, Counter>();
    const first = await startTestApi({ store: new SharedFixedWindowStore(counters, 'booking:') });
    const second = await startTestApi({ store: new SharedFixedWindowStore(counters, 'booking:') });

    for (let index = 0; index < 5; index += 1) {
      expect((await post(index % 2 === 0 ? first : second)).status).toBe(200);
    }
    const blocked = await post(second);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(await blocked.json()).toEqual({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' }
    });
  });

  it('keeps authenticated users independent', async () => {
    const api = await startTestApi({ store: new SharedFixedWindowStore(new Map(), 'booking:'), limit: 1 });
    expect((await post(api, 'user-a')).status).toBe(200);
    expect((await post(api, 'user-a')).status).toBe(429);
    expect((await post(api, 'user-b')).status).toBe(200);
  });

  it('expires a fixed-window counter', async () => {
    const api = await startTestApi({ store: new SharedFixedWindowStore(new Map(), 'booking:'), limit: 1, windowMs: 40 });
    expect((await post(api)).status).toBe(200);
    expect((await post(api)).status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await post(api)).status).toBe(200);
  });

  it('uses separate endpoint policy namespaces', async () => {
    const counters = new Map<string, Counter>();
    const booking = await startTestApi({ store: new SharedFixedWindowStore(counters, 'booking:'), name: 'booking', limit: 1 });
    const confirm = await startTestApi({ store: new SharedFixedWindowStore(counters, 'confirm:'), name: 'confirm', limit: 1 });
    expect((await post(booking)).status).toBe(200);
    expect((await post(confirm)).status).toBe(200);
  });

  it('fails open when the shared store is unavailable', async () => {
    const api = await startTestApi({ store: new FailingStore(), limit: 1 });
    expect((await post(api)).status).toBe(200);
  });

  it('normalizes and hashes login account keys instead of exposing email addresses', () => {
    const first = rateLimitModule.loginAccountKey({ body: { email: ' Patient@Example.Test ' }, ip: '127.0.0.1' } as Request);
    const second = rateLimitModule.loginAccountKey({ body: { email: 'patient@example.test' }, ip: '127.0.0.1' } as Request);
    expect(first).toBe(second);
    expect(first).not.toContain('patient@example.test');
  });
});
