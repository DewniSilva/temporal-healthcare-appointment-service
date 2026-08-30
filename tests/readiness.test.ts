import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dependencyMocks = vi.hoisted(() => ({
  database: vi.fn().mockResolvedValue([{ result: 1 }]),
  temporal: vi.fn().mockResolvedValue({}),
  redisPing: vi.fn().mockRejectedValue(new Error('redis unavailable')),
  redisCall: vi.fn().mockResolvedValue('test-script-sha')
}));

vi.mock('../src/shared/database/prisma', () => ({
  prisma: { $queryRaw: dependencyMocks.database }
}));
vi.mock('../src/backend/temporal/client', () => ({
  temporalClient: () => ({ workflowService: { getSystemInfo: dependencyMocks.temporal } })
}));
vi.mock('../src/backend/redis/client', () => ({
  redisClient: () => ({ ping: dependencyMocks.redisPing, call: dependencyMocks.redisCall })
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET ??= 'test-secret-at-least-thirty-two-characters';
  const { createApp } = await import('../src/backend/app');
  server = await new Promise<Server>((resolve) => {
    const candidate = createApp().listen(0, '127.0.0.1', () => resolve(candidate));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind to TCP');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('health probes', () => {
  it('keeps liveness healthy while Redis is unavailable', async () => {
    const response = await fetch(`${baseUrl}/liveness`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('reports Redis unavailable through readiness', async () => {
    const response = await fetch(`${baseUrl}/readiness`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'unavailable',
      database: 'ready',
      temporalClient: 'ready',
      redis: 'unavailable'
    });
  });
});
