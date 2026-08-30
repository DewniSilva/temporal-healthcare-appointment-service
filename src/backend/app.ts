import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createLoginRateLimiters } from './api/middleware/rateLimit.middleware';
import { requestId } from './api/middleware/requestId.middleware';
import { errorHandler, notFound } from './api/middleware/error.middleware';
import { createAppointmentRouter } from './api/appointment.routes';
import { createClinicClosureRouter, createDoctorScheduleRouter } from './api/doctorSchedule.routes';
import { getEnv } from '../shared/config/env';
import { loginSchema } from './api/appointment.schema';
import { login } from './auth/auth.service';
import { prisma } from '../shared/database/prisma';
import { logger } from '../shared/logging/logger';
import { temporalClient } from './temporal/client';
import { redisClient } from './redis/client';

export function createApp() {
  const env = getEnv();
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, methods: ['GET', 'POST'], allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'] }));
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use(requestId);
  app.use((req, res, next) => {
    const started = Date.now();
    if (req.path !== '/health' && req.path !== '/liveness' && req.path !== '/readiness') {
      res.on('finish', () => logger.info({ event: 'http_request', requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started }));
    }
    next();
  });

  const loginLimiters = createLoginRateLimiters();
  app.post('/auth/login', ...loginLimiters, async (req, res) => {
    const body = loginSchema.parse(req.body);
    res.json(await login(body.email, body.password));
  });
  // Liveness answers "is the process alive?" — no dependency checks, so a
  // slow/unavailable Postgres or Temporal never causes an orchestrator to
  // kill and restart an otherwise-healthy process.
  app.get('/liveness', (_req, res) => res.status(200).json({ status: 'ok' }));

  const readiness = async (_req: Request, res: Response) => {
    // Each dependency is checked independently so one being down doesn't hide
    // the other's status, and a probe against an uninitialized Temporal
    // client (a sync throw) is turned into a rejection alongside it.
    const [dbResult, temporalResult, redisResult] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      (async () => temporalClient().workflowService.getSystemInfo({}))(),
      (async () => redisClient().ping())()
    ]);
    const database = dbResult.status === 'fulfilled' ? 'ready' : 'unavailable';
    const temporal = temporalResult.status === 'fulfilled' ? 'ready' : 'unavailable';
    const redis = redisResult.status === 'fulfilled' ? 'ready' : 'unavailable';
    const healthy = database === 'ready' && temporal === 'ready' && redis === 'ready';
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'unavailable', database, temporalClient: temporal, redis });
  };
  // Readiness answers "can the app actually do its work?" — checked against
  // every dependency it needs. Kept at /health too, unchanged, so the
  // existing frontend HealthCard keeps working without modification.
  app.get('/readiness', readiness);
  app.get('/health', readiness);
  app.use('/appointments', createAppointmentRouter());
  app.use('/doctors', createDoctorScheduleRouter());
  app.use('/clinic-closures', createClinicClosureRouter());
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
