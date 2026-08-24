import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { requestId } from './api/middleware/requestId.middleware';
import { errorHandler, notFound } from './api/middleware/error.middleware';
import { appointmentRouter } from './api/appointment.routes';
import { getEnv } from '../shared/config/env';
import { loginSchema } from './api/appointment.schema';
import { login } from './auth/auth.service';
import { prisma } from '../shared/database/prisma';
import { logger } from '../shared/logging/logger';

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

  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  app.post('/auth/login', authLimiter, async (req, res) => {
    const body = loginSchema.parse(req.body);
    res.json(await login(body.email, body.password));
  });
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'ready', temporalClient: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.use('/appointments', appointmentRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
