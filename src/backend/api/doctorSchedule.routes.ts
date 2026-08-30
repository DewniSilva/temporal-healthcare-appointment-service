import { Router } from 'express';
import {
  addAvailability,
  addClinicClosure,
  addScheduleException,
  editAvailability,
  readAvailability,
  readAvailableSlots,
  readClinicClosures,
  readScheduleExceptions,
  removeAvailability,
  removeClinicClosure,
  removeScheduleException
} from './doctorSchedule.controller';
import { requireAuth } from './middleware/auth.middleware';
import { createAuthenticatedRateLimiter } from './middleware/rateLimit.middleware';

// See appointment.routes.ts's comment: the rate limiter loads its Lua script
// on construction, so these must be created after connectRedis(), inside the
// router factory rather than at module scope.
export function createDoctorScheduleRouter(): Router {
  const mutationLimiter = createAuthenticatedRateLimiter('management');
  const router = Router();

  router.use(requireAuth);
  router.get('/:doctorId/available-slots', readAvailableSlots);
  router.get('/:doctorId/availability', readAvailability);
  router.post('/:doctorId/availability', mutationLimiter, addAvailability);
  router.put('/:doctorId/availability/:itemId', mutationLimiter, editAvailability);
  router.delete('/:doctorId/availability/:itemId', mutationLimiter, removeAvailability);
  router.get('/:doctorId/schedule-exceptions', readScheduleExceptions);
  router.post('/:doctorId/schedule-exceptions', mutationLimiter, addScheduleException);
  router.delete('/:doctorId/schedule-exceptions/:itemId', mutationLimiter, removeScheduleException);

  return router;
}

export function createClinicClosureRouter(): Router {
  const mutationLimiter = createAuthenticatedRateLimiter('management');
  const router = Router();

  router.use(requireAuth);
  router.get('/', readClinicClosures);
  router.post('/', mutationLimiter, addClinicClosure);
  router.delete('/:itemId', mutationLimiter, removeClinicClosure);

  return router;
}
