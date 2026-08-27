import { Router } from 'express';
import { cancel, confirm, createAppointment, readAppointment, readWorkflow } from './appointment.controller';
import { requireAuth } from './middleware/auth.middleware';
import { createRateLimiter } from './middleware/rateLimit.middleware';

// A function, not a module-level constant: the Redis-backed rate limiter
// loads its Lua script as soon as it's constructed, so this must run after
// connectRedis() (called from createAppointmentRouter()'s caller in
// createApp(), itself only invoked once server.ts has connected Redis) —
// not at import time, before Redis is ready.
export function createAppointmentRouter(): Router {
  const mutationLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });
  const appointmentRouter = Router();

  appointmentRouter.use(requireAuth);
  appointmentRouter.post('/', mutationLimiter, createAppointment);
  appointmentRouter.get('/:id', readAppointment);
  appointmentRouter.get('/:id/workflow', readWorkflow);
  appointmentRouter.post('/:id/confirm', mutationLimiter, confirm);
  appointmentRouter.post('/:id/cancel', mutationLimiter, cancel);

  return appointmentRouter;
}
