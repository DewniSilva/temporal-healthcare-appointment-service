import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import express from 'express';
import type { Server } from 'node:http';
import { reservationRepository, SlotConflictError } from '../../src/worker/reservation/reservation.repository';
import { closeRedis, connectRedis } from '../../src/backend/redis/client';
import { createRateLimiter, authenticatedUserKey } from '../../src/backend/api/middleware/rateLimit.middleware';

const suite = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;
const prisma = new PrismaClient();
const redisA = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true });
const redisB = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true });

suite('real PostgreSQL and Redis', () => {
  afterAll(async () => {
    await Promise.allSettled([prisma.$disconnect(), redisA.quit(), redisB.quit(), closeRedis()]);
  });

  it('runs against the migrated PostgreSQL schema', async () => {
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('Appointment', 'SlotReservation', 'Reminder')
    `;
    expect(tables.map((row) => row.name).sort()).toEqual(['Appointment', 'Reminder', 'SlotReservation']);
    const constraints = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name FROM pg_constraint WHERE contype = 'x'
    `;
    expect(constraints.length).toBeGreaterThan(0);
  });

  it('enforces overlapping reservations while allowing an adjacent slot', async () => {
    const suffix = `${Date.now()}`;
    const userIds = [`it-patient-user-${suffix}`, `it-doctor-user-${suffix}`];
    const patientId = `it-patient-${suffix}`;
    const doctorId = `it-doctor-${suffix}`;
    const appointmentIds = [`it-apt-a-${suffix}`, `it-apt-b-${suffix}`, `it-apt-c-${suffix}`];
    const start = new Date('2035-01-01T09:00:00.000Z');
    try {
      await prisma.user.createMany({ data: [
        { id: userIds[0], email: `${userIds[0]}@example.test`, passwordHash: 'unused', role: 'PATIENT' },
        { id: userIds[1], email: `${userIds[1]}@example.test`, passwordHash: 'unused', role: 'DOCTOR' }
      ] });
      await prisma.patient.create({ data: { id: patientId, displayName: 'Integration Patient', userId: userIds[0] } });
      await prisma.doctor.create({ data: { id: doctorId, displayName: 'Integration Doctor', userId: userIds[1] } });
      await prisma.appointment.createMany({ data: [
        { id: appointmentIds[0], patientId, doctorId, appointmentTime: start, appointmentTzOffsetMinutes: 0 },
        { id: appointmentIds[1], patientId, doctorId, appointmentTime: new Date(start.getTime() + 10 * 60_000), appointmentTzOffsetMinutes: 0 },
        { id: appointmentIds[2], patientId, doctorId, appointmentTime: new Date(start.getTime() + 20 * 60_000), appointmentTzOffsetMinutes: 0 }
      ] });
      await reservationRepository.reserve({ appointmentId: appointmentIds[0], doctorId, appointmentTime: start.toISOString() });
      await expect(reservationRepository.reserve({ appointmentId: appointmentIds[1], doctorId, appointmentTime: new Date(start.getTime() + 10 * 60_000).toISOString() })).rejects.toBeInstanceOf(SlotConflictError);
      await expect(reservationRepository.reserve({ appointmentId: appointmentIds[2], doctorId, appointmentTime: new Date(start.getTime() + 20 * 60_000).toISOString() })).resolves.toBeUndefined();
    } finally {
      await prisma.slotReservation.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
      await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
      await prisma.patient.deleteMany({ where: { id: patientId } });
      await prisma.doctor.deleteMany({ where: { id: doctorId } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it('shares atomic counters between independent Redis clients', async () => {
    await Promise.all([redisA.connect(), redisB.connect()]);
    const key = `integration:rate-limit:${Date.now()}`;
    try {
      const values = await Promise.all([redisA.incr(key), redisB.incr(key)]);
      expect(values.sort()).toEqual([1, 2]);
      expect(await redisA.get(key)).toBe('2');
    } finally {
      await redisA.del(key);
    }
  });

  it('enforces a shared Redis-backed HTTP limit and expires its window', async () => {
    await connectRedis(1);
    const servers: Server[] = [];
    const startApi = async () => {
      const app = express();
      app.use((req, _res, next) => {
        req.auth = { userId: req.header('x-test-user')!, role: 'PATIENT' };
        req.requestId = 'redis-integration';
        next();
      });
      app.post('/limited', createRateLimiter({ name: 'booking', limit: 2, windowMs: 100, keyGenerator: authenticatedUserKey }), (_req, res) => res.sendStatus(204));
      const server = app.listen(0);
      servers.push(server);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
      return `http://127.0.0.1:${address.port}/limited`;
    };
    const user = `integration-user-${Date.now()}`;
    try {
      const [apiA, apiB] = await Promise.all([startApi(), startApi()]);
      const request = (url: string) => fetch(url, { method: 'POST', headers: { 'x-test-user': user } });
      expect((await request(apiA)).status).toBe(204);
      expect((await request(apiB)).status).toBe(204);
      expect((await request(apiA)).status).toBe(429);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect((await request(apiB)).status).toBe(204);
    } finally {
      await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    }
  });
});
