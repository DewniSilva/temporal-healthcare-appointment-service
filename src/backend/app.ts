import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createRateLimiter } from './api/middleware/rateLimit.middleware';
import { requestId } from './api/middleware/requestId.middleware';
import { errorHandler, notFound } from './api/middleware/error.middleware';
import { createAppointmentRouter } from './api/appointment.routes';
import { getEnv } from '../shared/config/env';
import { loginSchema } from './api/appointment.schema';
import { login } from './auth/auth.service';
import { prisma } from '../shared/database/prisma';
import { logger } from '../shared/logging/logger';
import { temporalClient } from './temporal/client';
import { redisClient } from './redis/client';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: getEnv().CORS_ORIGIN, methods: ['GET', 'POST'], allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'] }));
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use(requestId);
  app.use((req, res, next) => {
    const started = Date.now();
    if (req.path !== '/health') {
      res.on('finish', () => logger.info({ event: 'http_request', requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started }));
    }
    next();
  });

  const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, limit: 20 });
  app.post('/auth/login', authLimiter, async (req, res) => {
    const body = loginSchema.parse(req.body);
    res.json(await login(body.email, body.password));
  });
  app.get('/health', async (_req, res) => {
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
  });
  app.use('/appointments', createAppointmentRouter());
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
