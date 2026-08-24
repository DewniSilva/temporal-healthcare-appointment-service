import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { cancel, confirm, createAppointment, readAppointment, readWorkflow } from './appointment.controller';
import { requireAuth } from './middleware/auth.middleware';

const mutationLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
export const appointmentRouter = Router();

appointmentRouter.use(requireAuth);
appointmentRouter.post('/', mutationLimiter, createAppointment);
appointmentRouter.get('/:id', readAppointment);
appointmentRouter.get('/:id/workflow', readWorkflow);
appointmentRouter.post('/:id/confirm', mutationLimiter, confirm);
appointmentRouter.post('/:id/cancel', mutationLimiter, cancel);
