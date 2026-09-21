import { Router } from 'express';
import { cancel, complete, confirm, createAppointment, markNoShow, readAppointment, readAppointments, readWorkflow } from './appointment.controller';
import { requireAuth } from './middleware/auth.middleware';
import { createAuthenticatedRateLimiter } from './middleware/rateLimit.middleware';

// A function, not a module-level constant: the Redis-backed rate limiter
// loads its Lua script as soon as it's constructed, so this must run after
// connectRedis() (called from createAppointmentRouter()'s caller in
// createApp(), itself only invoked once server.ts has connected Redis) —
// not at import time, before Redis is ready.
export function createAppointmentRouter(): Router {
  const bookingLimiter = createAuthenticatedRateLimiter('booking');
  const confirmLimiter = createAuthenticatedRateLimiter('confirm');
  const cancelLimiter = createAuthenticatedRateLimiter('cancel');
  const managementLimiter = createAuthenticatedRateLimiter('management');
  const appointmentRouter = Router();

  appointmentRouter.use(requireAuth);
  appointmentRouter.get('/', readAppointments);
  appointmentRouter.post('/', bookingLimiter, createAppointment);
  appointmentRouter.get('/:id', readAppointment);
  appointmentRouter.get('/:id/workflow', readWorkflow);
  appointmentRouter.post('/:id/confirm', confirmLimiter, confirm);
  appointmentRouter.post('/:id/cancel', cancelLimiter, cancel);
  appointmentRouter.post('/:id/complete', managementLimiter, complete);
  appointmentRouter.post('/:id/no-show', managementLimiter, markNoShow);

  return appointmentRouter;
}
