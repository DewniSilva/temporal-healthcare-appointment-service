import { z } from 'zod';

const id = z.string().min(3).max(80).regex(/^[A-Za-z0-9_-]+$/, 'ID contains unsupported characters');

export const appointmentParamsSchema = z.object({ id }).strict();
export const createAppointmentSchema = z.object({
  patientId: id,
  doctorId: id,
  appointmentTime: z.iso.datetime({ offset: true }).refine((value) => new Date(value).getTime() > Date.now(), 'Appointment time must be in the future')
}).strict();
export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(8).max(128) }).strict();

export const idempotencyKeySchema = z.string().min(8).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
